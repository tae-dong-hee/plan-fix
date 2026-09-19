package taedonghee.plan_fix.application.board;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.awt.Color;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class StoryImagePreparerTest {
    @Test void decodesImageBytesRatherThanTrustingFileNameAndMimeTypeAndDownscales() throws Exception {
        var photo = photo(2600, 1300, "png");
        byte[] prepared = StoryImagePreparer.prepare(photo);
        var decoded = ImageIO.read(new ByteArrayInputStream(prepared));
        assertThat(decoded.getWidth()).isEqualTo(1280);
        assertThat(decoded.getHeight()).isEqualTo(640);
        assertThat(prepared[0]).isEqualTo((byte) 0xff);
        assertThat(prepared[1]).isEqualTo((byte) 0xd8);
    }

    @Test void supportsJpegInput() throws Exception {
        assertThat(ImageIO.read(new ByteArrayInputStream(StoryImagePreparer.prepare(photo(8, 4, "jpg"))))).isNotNull();
    }

    @Test void supportsRealWebpAndRejectsCorruptRiffLength() throws Exception {
        byte[] webp = Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");
        var photo = new MockMultipartFile("files", "photo.webp", "image/webp", webp);
        assertThat(ImageIO.read(new ByteArrayInputStream(StoryImagePreparer.prepare(photo)))).isNotNull();
        webp[4] = 0;
        assertInvalid(new MockMultipartFile("files", "photo.webp", "image/webp", webp));
    }

    @Test void appliesPhoneExifRotationBeforeStrippingMetadata() throws Exception {
        var image = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < 40; x++) for (int y = 0; y < 20; y++) image.setRGB(x, y, (x < 20 ? Color.RED : Color.BLUE).getRGB());
        var encoded = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", encoded);
        var rotated = ImageIO.read(new ByteArrayInputStream(StoryImagePreparer.prepare(withOrientation(encoded.toByteArray(), 6))));
        assertThat(rotated.getWidth()).isEqualTo(20);
        assertThat(rotated.getHeight()).isEqualTo(40);
        assertThat(new Color(rotated.getRGB(10, 5)).getRed()).isGreaterThan(220);
        assertThat(new Color(rotated.getRGB(10, 35)).getBlue()).isGreaterThan(220);
        var mirrored = ImageIO.read(new ByteArrayInputStream(StoryImagePreparer.prepare(withOrientation(encoded.toByteArray(), 2))));
        assertThat(new Color(mirrored.getRGB(5, 10)).getBlue()).isGreaterThan(220);
    }

    private static MockMultipartFile withOrientation(byte[] jpeg, int orientation) throws Exception {
        var exif = ByteBuffer.allocate(34).order(ByteOrder.BIG_ENDIAN);
        exif.putShort((short) 34).put(new byte[]{'E', 'x', 'i', 'f', 0, 0});
        exif.putShort((short) 0x4d4d).putShort((short) 42).putInt(8).putShort((short) 1);
        exif.putShort((short) 0x0112).putShort((short) 3).putInt(1).putShort((short) orientation).putShort((short) 0);
        exif.putInt(0);
        var result = new ByteArrayOutputStream();
        result.write(jpeg, 0, 2);
        result.write(new byte[]{(byte) 0xff, (byte) 0xe1});
        result.write(exif.array());
        result.write(jpeg, 2, jpeg.length - 2);
        return new MockMultipartFile("files", "phone.jpg", "image/jpeg", result.toByteArray());
    }

    @Test void rejectsSpoofedTruncatedAndUnsupportedImageFormats() throws Exception {
        assertInvalid(new MockMultipartFile("files", "photo.jpg", "image/jpeg", "not an image".getBytes()));
        assertInvalid(new MockMultipartFile("files", "photo.png", "image/png", new byte[]{(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}));
        assertInvalid(photo(8, 4, "gif"));
        assertInvalid(photo(12001, 1, "png"));
    }

    @Test void enforcesIndividualAndCombinedOriginalByteLimits() {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getSize()).thenReturn((long) StoryImagePreparer.MAX_FILE_BYTES);
        StoryImagePreparer.validateFiles(Collections.nCopies(3, file));
        assertTooLarge(() -> StoryImagePreparer.validateFiles(Collections.nCopies(4, file)));
        when(file.getSize()).thenReturn((long) StoryImagePreparer.MAX_FILE_BYTES + 1);
        assertTooLarge(() -> StoryImagePreparer.validateFiles(List.of(file)));
    }

    @Test void boundedStreamReadDoesNotTrustReportedSize() throws Exception {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getSize()).thenReturn(1L);
        when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[StoryImagePreparer.MAX_FILE_BYTES + 1]));
        assertTooLarge(() -> StoryImagePreparer.prepare(file));
    }

    @Test void rejectsEmptyFiles() {
        assertThatThrownBy(() -> StoryImagePreparer.validateFiles(List.of(new MockMultipartFile("files", new byte[0]))))
                .isInstanceOf(CoreException.class);
    }

    private static MockMultipartFile photo(int width, int height, String format) throws Exception {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), format, output);
        return new MockMultipartFile("files", "untrusted.svg", "application/octet-stream", output.toByteArray());
    }
    private static void assertInvalid(MultipartFile file) {
        assertThatThrownBy(() -> StoryImagePreparer.prepare(file)).isInstanceOfSatisfying(CoreException.class,
                exception -> assertThat(exception.getErrorType()).isEqualTo(ErrorType.BAD_REQUEST));
    }
    private static void assertTooLarge(Runnable operation) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(CoreException.class,
                exception -> assertThat(exception.getErrorType()).isEqualTo(ErrorType.PAYLOAD_TOO_LARGE));
    }
}
