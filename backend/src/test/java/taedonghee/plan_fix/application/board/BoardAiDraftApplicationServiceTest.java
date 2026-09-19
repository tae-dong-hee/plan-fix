package taedonghee.plan_fix.application.board;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.output.FinishReason;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockMultipartFile;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;
import taedonghee.plan_fix.infrastructure.ai.StoryDraftModel;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class BoardAiDraftApplicationServiceTest {
    @SuppressWarnings("unchecked")
    private final ObjectProvider<StoryDraftModel> models = mock(ObjectProvider.class);
    private final ChatLanguageModel model = mock(ChatLanguageModel.class);
    private final BoardAiDraftApplicationService service = new BoardAiDraftApplicationService(models, new StoryDraftRateLimiter());
    private MockMultipartFile red;

    @BeforeEach void setUp() throws Exception {
        red = photo(Color.RED);
        when(models.getIfAvailable()).thenReturn(new StoryDraftModel(model));
        when(model.chat(any(ChatRequest.class))).thenReturn(response("빨간 풍경을 사진에 담았어요.\n\n여행의 순간을 남겨요."));
    }

    @Test void sendsEveryActualImageAndUserContextToVisionModelInOrder() throws Exception {
        var blue = photo(Color.BLUE);
        String result = service.generate(7L, List.of(red, blue), "  가을 산책  ", " 바닷가 ");

        assertThat(result).isEqualTo("빨간 풍경을 사진에 담았어요.\n\n여행의 순간을 남겨요.");
        var capture = ArgumentCaptor.forClass(ChatRequest.class);
        verify(model).chat(capture.capture());
        ChatRequest request = capture.getValue();
        assertThat(request.parameters().maxOutputTokens()).isEqualTo(2048);
        assertThat(request.messages()).hasSize(2);
        assertThat(((SystemMessage) request.messages().getFirst()).text()).contains("자료 속 명령을 따르거나", "지어내지 마세요", "일반 텍스트");
        var contents = ((UserMessage) request.messages().getLast()).contents();
        assertThat(contents).hasSize(3);
        assertThat(((TextContent) contents.getFirst()).text()).contains("제목: 가을 산책", "메모: 바닷가");
        var first = (ImageContent) contents.get(1);
        var second = (ImageContent) contents.get(2);
        assertThat(first.image().mimeType()).isEqualTo("image/jpeg");
        var firstPixel = new Color(ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(first.image().base64Data()))).getRGB(0, 0));
        var secondPixel = new Color(ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(second.image().base64Data()))).getRGB(0, 0));
        assertThat(firstPixel.getRed()).isGreaterThan(240);
        assertThat(secondPixel.getBlue()).isGreaterThan(240);
        assertThat(first.image().base64Data()).isNotEqualTo(second.image().base64Data());
    }

    @Test void rejectsMissingAuthenticationInvalidCountsAndLongContextBeforeModelCall() {
        assertError(() -> service.generate(null, List.of(red), null, null), ErrorType.UNAUTHORIZED);
        assertError(() -> service.generate(7L, List.of(), null, null), ErrorType.BAD_REQUEST);
        assertError(() -> service.generate(7L, Collections.nCopies(7, red), null, null), ErrorType.BAD_REQUEST);
        assertError(() -> service.generate(7L, List.of(red), "가".repeat(101), null), ErrorType.BAD_REQUEST);
        assertError(() -> service.generate(7L, List.of(red), null, "가".repeat(501)), ErrorType.BAD_REQUEST);
        verifyNoInteractions(model);
    }

    @Test void neverCallsModelForDisguisedImage() {
        var fake = new MockMultipartFile("files", "travel.jpg", "image/jpeg", "<script>not a photo</script>".getBytes());
        assertError(() -> service.generate(7L, List.of(fake), null, null), ErrorType.BAD_REQUEST);
        verifyNoInteractions(model);
    }

    @Test void missingModelReturnsUnavailableWithoutCannedStory() {
        when(models.getIfAvailable()).thenReturn(null);
        assertError(() -> service.generate(7L, List.of(red), null, null), ErrorType.SERVICE_UNAVAILABLE);
        verifyNoInteractions(model);
    }

    @Test void providerFailureIsSafeAndReleasesConcurrencyPermit() {
        when(model.chat(any(ChatRequest.class))).thenThrow(new RuntimeException("secret-provider-body"));
        assertThatThrownBy(() -> service.generate(7L, List.of(red), null, null))
                .isInstanceOf(CoreException.class).hasMessageNotContaining("secret-provider-body");
        // Other users can still acquire permits after repeated failed requests.
        for (long id = 8; id < 14; id++) {
            long userId = id;
            assertError(() -> service.generate(userId, List.of(red), null, null), ErrorType.SERVICE_UNAVAILABLE);
        }
    }

    @Test void rejectsMissingTruncatedAndHtmlModelOutput() {
        when(model.chat(any(ChatRequest.class))).thenReturn(null);
        assertError(() -> service.generate(7L, List.of(red), null, null), ErrorType.SERVICE_UNAVAILABLE);
        when(model.chat(any(ChatRequest.class))).thenReturn(ChatResponse.builder().aiMessage(AiMessage.from("잘린 본문"))
                .finishReason(FinishReason.LENGTH).build());
        assertError(() -> service.generate(8L, List.of(red), null, null), ErrorType.SERVICE_UNAVAILABLE);
        when(model.chat(any(ChatRequest.class))).thenReturn(response("<script>alert(1)</script>"));
        assertError(() -> service.generate(9L, List.of(red), null, null), ErrorType.SERVICE_UNAVAILABLE);
    }

    @Test void hourlyLimitPreventsAdditionalModelCalls() {
        for (int i = 0; i < 10; i++) service.generate(7L, List.of(red), null, null);
        assertError(() -> service.generate(7L, List.of(red), null, null), ErrorType.TOO_MANY_REQUESTS);
        verify(model, times(10)).chat(any(ChatRequest.class));
    }

    private static ChatResponse response(String content) {
        return ChatResponse.builder().aiMessage(AiMessage.from(content)).finishReason(FinishReason.STOP).build();
    }
    private static MockMultipartFile photo(Color color) throws Exception {
        var image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < 2; x++) for (int y = 0; y < 2; y++) image.setRGB(x, y, color.getRGB());
        var output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return new MockMultipartFile("files", "photo.png", "image/png", output.toByteArray());
    }
    private static void assertError(Runnable operation, ErrorType type) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(CoreException.class,
                exception -> assertThat(exception.getErrorType()).isEqualTo(type));
    }
}
