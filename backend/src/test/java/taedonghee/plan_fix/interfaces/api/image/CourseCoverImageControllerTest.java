package taedonghee.plan_fix.interfaces.api.image;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import taedonghee.plan_fix.application.image.CourseCoverImageApplicationService;
import taedonghee.plan_fix.application.image.CourseCoverImageApplicationService.CoverImage;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;
import taedonghee.plan_fix.support.error.GlobalExceptionHandler;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CourseCoverImageControllerTest {

    private static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xd9};
    private static final String SHA = "a".repeat(64);
    private final CourseCoverImageApplicationService service = mock(CourseCoverImageApplicationService.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new CourseCoverImageController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        when(service.get("pyeongchang-meadow")).thenReturn(new CoverImage(JPEG, SHA, "2026-09-v1"));
    }

    @Test
    void returnsImageBytesWithoutJsonEncodingWithVersionedCacheHeaders() throws Exception {
        mvc.perform(get("/api/v1/images/course-covers/pyeongchang-meadow").param("v", "2026-09-v1"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG))
                .andExpect(content().bytes(JPEG))
                .andExpect(header().string("Cache-Control", "max-age=31536000, public, immutable"))
                .andExpect(header().string("ETag", "\"" + SHA + "\""))
                .andExpect(header().string("Content-Length", "4"));
    }

    @Test
    void unversionedUrlUsesShortCacheSoCatalogUpdatesCanAppear() throws Exception {
        mvc.perform(get("/api/v1/images/course-covers/pyeongchang-meadow"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "max-age=3600, public"));
    }

    @Test
    void matchingEtagReturnsNotModified() throws Exception {
        mvc.perform(get("/api/v1/images/course-covers/pyeongchang-meadow")
                        .header("If-None-Match", "\"" + SHA + "\""))
                .andExpect(status().isNotModified())
                .andExpect(content().string(""));
    }

    @Test
    void unknownCatalogIdReturnsNotFound() throws Exception {
        when(service.get("unknown")).thenThrow(new CoreException(ErrorType.NOT_FOUND));

        mvc.perform(get("/api/v1/images/course-covers/unknown"))
                .andExpect(status().isNotFound());
    }
}
