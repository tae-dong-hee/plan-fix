package taedonghee.plan_fix.infrastructure.ai;

import dev.langchain4j.model.chat.ChatLanguageModel;

/** Separate bean type keeps short, non-retrying photo requests independent of course planning. */
public record StoryDraftModel(ChatLanguageModel model) { }
