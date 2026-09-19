package taedonghee.plan_fix.application.board;

import org.springframework.web.multipart.MultipartFile;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Decode trusted raster formats, limit memory use, and strip metadata before sending to Gemini. */
final class StoryImagePreparer {
    static final int MAX_FILE_BYTES = 5 * 1024 * 1024;
    static final int MAX_TOTAL_BYTES = 15 * 1024 * 1024;
    static final int MAX_IMAGES = 6;
    private static final int MAX_EDGE = 1280;

    static void validateFiles(List<MultipartFile> files) {
        if (files == null || files.isEmpty() || files.size() > MAX_IMAGES) {
            throw invalid("여행 사진을 1장 이상, 6장 이하로 선택해 주세요.");
        }
        long total = 0;
        for (var file : files) {
            if (file == null || file.isEmpty()) throw invalid("빈 사진 파일은 사용할 수 없습니다.");
            if (file.getSize() > MAX_FILE_BYTES) throw tooLarge("사진 한 장은 5MB 이하로 올려 주세요.");
            total += file.getSize();
        }
        if (total > MAX_TOTAL_BYTES) throw tooLarge("사진의 전체 용량은 15MB 이하로 올려 주세요.");
    }

    static byte[] prepare(MultipartFile file) {
        try (var stream = file.getInputStream()) {
            byte[] bytes = stream.readNBytes(MAX_FILE_BYTES + 1);
            if (bytes.length > MAX_FILE_BYTES) throw tooLarge("사진 한 장은 5MB 이하로 올려 주세요.");
            String format = format(bytes);
            try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(input);
                if (!readers.hasNext()) throw invalidImage();
                var reader = readers.next();
                try {
                    reader.setInput(input, true, true);
                    if (!format.equalsIgnoreCase(reader.getFormatName())) throw invalidImage();
                    int width = reader.getWidth(0), height = reader.getHeight(0);
                    if (width <= 0 || height <= 0 || width > 12000 || height > 12000
                            || (long) width * height > 50_000_000) {
                        throw invalid("사진 크기가 너무 큽니다. 5,000만 화소 이하, 가로·세로 12,000px 이하로 줄여 주세요.");
                    }
                    var params = reader.getDefaultReadParam();
                    int sample = Math.max(1, Math.max(width, height) / MAX_EDGE);
                    params.setSourceSubsampling(sample, sample, 0, 0);
                    BufferedImage decoded = reader.read(0, params);
                    if (decoded == null) throw invalidImage();
                    try {
                        return jpeg(decoded, "JPEG".equals(format) ? jpegOrientation(bytes) : 1);
                    } finally {
                        decoded.flush();
                    }
                } finally {
                    reader.dispose();
                }
            }
        } catch (IOException | IllegalArgumentException exception) {
            throw invalidImage();
        }
    }

    private static byte[] jpeg(BufferedImage decoded, int orientation) throws IOException {
        double scale = Math.min(1d, (double) MAX_EDGE / Math.max(decoded.getWidth(), decoded.getHeight()));
        int width = Math.max(1, (int) Math.round(decoded.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(decoded.getHeight() * scale));
        boolean rotate = orientation >= 5;
        var raster = new BufferedImage(rotate ? height : width, rotate ? width : height, BufferedImage.TYPE_INT_RGB);
        var graphics = raster.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, raster.getWidth(), raster.getHeight());
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.transform(switch (orientation) {
                case 2 -> new AffineTransform(-1, 0, 0, 1, width, 0);
                case 3 -> new AffineTransform(-1, 0, 0, -1, width, height);
                case 4 -> new AffineTransform(1, 0, 0, -1, 0, height);
                case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
                case 6 -> new AffineTransform(0, 1, -1, 0, height, 0);
                case 7 -> new AffineTransform(0, -1, -1, 0, height, width);
                case 8 -> new AffineTransform(0, -1, 1, 0, 0, width);
                default -> new AffineTransform();
            });
            graphics.drawImage(decoded, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        try (var bytes = new ByteArrayOutputStream(); var output = new MemoryCacheImageOutputStream(bytes)) {
            writer.setOutput(output);
            var params = writer.getDefaultWriteParam();
            params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            params.setCompressionQuality(0.82f);
            writer.write(null, new IIOImage(raster, null, null), params);
            output.flush();
            // Six base64 images remain below Gemini's inline request limit.
            if (bytes.size() > 2 * 1024 * 1024) throw tooLarge("사진을 더 작게 줄인 뒤 다시 시도해 주세요.");
            return bytes.toByteArray();
        } finally {
            writer.dispose();
            raster.flush();
        }
    }

    /** Read only bounded EXIF orientation; all metadata is discarded by the JPEG encoder. */
    private static int jpegOrientation(byte[] bytes) {
        int offset = 2;
        while (offset + 4 <= bytes.length && (bytes[offset] & 0xff) == 0xff) {
            while (offset < bytes.length && (bytes[offset] & 0xff) == 0xff) offset++;
            if (offset >= bytes.length) break;
            int marker = bytes[offset++] & 0xff;
            if (marker == 0xda || marker == 0xd9) break;
            if (marker == 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
            if (offset + 2 > bytes.length) break;
            int length = ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
            if (length < 2 || offset + length > bytes.length) break;
            if (marker == 0xe1 && length >= 16 && ascii(bytes, offset + 2, "Exif\0\0")) {
                var tiff = ByteBuffer.wrap(bytes, offset + 8, length - 8).slice();
                int order = Short.toUnsignedInt(tiff.getShort(0));
                if (order != 0x4949 && order != 0x4d4d) return 1;
                tiff.order(order == 0x4949 ? ByteOrder.LITTLE_ENDIAN : ByteOrder.BIG_ENDIAN);
                if (tiff.getShort(2) != 42) return 1;
                long directory = Integer.toUnsignedLong(tiff.getInt(4));
                if (directory > tiff.limit() - 2) return 1;
                int count = Short.toUnsignedInt(tiff.getShort((int) directory));
                for (int i = 0; i < count; i++) {
                    long entry = directory + 2L + i * 12L;
                    if (entry + 12 > tiff.limit()) return 1;
                    int pos = (int) entry;
                    if (Short.toUnsignedInt(tiff.getShort(pos)) == 0x0112
                            && tiff.getShort(pos + 2) == 3 && tiff.getInt(pos + 4) == 1) {
                        int orientation = Short.toUnsignedInt(tiff.getShort(pos + 8));
                        return orientation >= 1 && orientation <= 8 ? orientation : 1;
                    }
                }
            }
            offset += length;
        }
        return 1;
    }

    private static String format(byte[] bytes) {
        if (startsAt(bytes, 0, new byte[]{(byte) 0xff, (byte) 0xd8, (byte) 0xff})) return "JPEG";
        if (startsAt(bytes, 0, new byte[]{(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})) return "PNG";
        if (bytes.length >= 20 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) {
            long size = Integer.toUnsignedLong(ByteBuffer.wrap(bytes, 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt());
            if (size + 8 != bytes.length) throw invalidImage();
            if (bytes.length >= 30 && ascii(bytes, 12, "VP8X") && (bytes[20] & 2) != 0) {
                throw invalid("움직이는 WebP는 지원하지 않습니다. 정지 사진을 선택해 주세요.");
            }
            return "WebP";
        }
        throw invalid("JPG, PNG, WebP 이미지 파일만 사용할 수 있습니다.");
    }

    private static boolean ascii(byte[] bytes, int offset, String signature) {
        return startsAt(bytes, offset, signature.getBytes(StandardCharsets.US_ASCII));
    }
    private static boolean startsAt(byte[] bytes, int offset, byte[] signature) {
        if (bytes.length < offset + signature.length) return false;
        for (int i = 0; i < signature.length; i++) if (bytes[offset + i] != signature[i]) return false;
        return true;
    }
    private static CoreException invalidImage() { return invalid("사진 파일을 읽을 수 없습니다. 다른 사진을 선택해 주세요."); }
    private static CoreException invalid(String message) { return new CoreException(ErrorType.BAD_REQUEST, message); }
    private static CoreException tooLarge(String message) { return new CoreException(ErrorType.PAYLOAD_TOO_LARGE, message); }
}
