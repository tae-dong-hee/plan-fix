package taedonghee.plan_fix.application.user;

import org.springframework.web.multipart.MultipartFile;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Checks actual image headers and dimensions; filenames and client MIME types are not trusted. */
final class ProfileImageValidator {
    static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final int MAX_DIMENSION = 8192;
    private static final long MAX_PIXELS = 20_000_000;

    static ValidatedImage validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw invalid("프로필 사진을 선택해 주세요.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw invalid("프로필 사진은 5MB 이하로 올려 주세요.");
        }
        try (var input = file.getInputStream()) {
            byte[] bytes = input.readNBytes(MAX_BYTES + 1);
            if (bytes.length > MAX_BYTES) {
                throw invalid("프로필 사진은 5MB 이하로 올려 주세요.");
            }
            if (startsWith(bytes, new byte[]{(byte) 0xff, (byte) 0xd8, (byte) 0xff})) {
                validateRaster(bytes, "JPEG");
                return new ValidatedImage(bytes, "image/jpeg", "jpg");
            }
            if (startsWith(bytes, new byte[]{(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})) {
                validateRaster(bytes, "PNG");
                return new ValidatedImage(bytes, "image/png", "png");
            }
            if (bytes.length >= 20 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) {
                if (java.nio.ByteBuffer.wrap(bytes, 4, 4).order(java.nio.ByteOrder.LITTLE_ENDIAN).getInt() + 8 != bytes.length) {
                    throw invalidImage();
                }
                if (bytes.length >= 30 && ascii(bytes, 12, "VP8X") && (bytes[20] & 2) != 0) {
                    throw invalid("움직이는 WebP는 지원하지 않습니다. 정지 이미지를 선택해 주세요.");
                }
                validateRaster(bytes, "WebP");
                return new ValidatedImage(bytes, "image/webp", "webp");
            }
            throw invalid("JPG, PNG, WebP 이미지 파일만 올릴 수 있습니다.");
        } catch (IOException | IllegalArgumentException exception) {
            throw invalid("이미지 파일을 읽을 수 없습니다. 다른 사진을 선택해 주세요.");
        }
    }

    private static void validateRaster(byte[] bytes, String format) throws IOException {
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw invalidImage();
            ImageReader reader = readers.next();
            try {
                reader.setInput(input);
                if (!format.equalsIgnoreCase(reader.getFormatName())) throw invalidImage();
                validateDimensions(reader.getWidth(0), reader.getHeight(0));
                if (reader.read(0) == null) throw invalidImage();
            } finally {
                reader.dispose();
            }
        }
    }

    private static void validateDimensions(long width, long height) {
        if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
            throw invalid("사진 크기가 너무 큽니다. 2,000만 화소 이하, 가로·세로 8,192px 이하의 사진을 선택해 주세요.");
        }
    }

    private static boolean ascii(byte[] bytes, int offset, String value) {
        return startsAt(bytes, offset, value.getBytes(StandardCharsets.US_ASCII));
    }

    private static boolean startsWith(byte[] bytes, byte[] signature) { return startsAt(bytes, 0, signature); }

    private static boolean startsAt(byte[] bytes, int offset, byte[] signature) {
        if (offset + signature.length > bytes.length) return false;
        for (int i = 0; i < signature.length; i++) if (bytes[offset + i] != signature[i]) return false;
        return true;
    }

    private static CoreException invalidImage() { return invalid("올바른 이미지 파일이 아닙니다. 다른 사진을 선택해 주세요."); }
    private static CoreException invalid(String message) { return new CoreException(ErrorType.BAD_REQUEST, message); }
    record ValidatedImage(byte[] bytes, String contentType, String extension) { }
}
