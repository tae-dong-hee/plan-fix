package taedonghee.plan_fix.domain.user;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.support.error.CoreException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UserModelTest {

    @Test
    void defaultAvatarUsesOneOfFiveColorsAndSurvivesProfileAndPhotoChanges() {
        UserModel user = UserModel.create("traveler", null, null);
        assertThat(user.getDefaultAvatarColor()).isIn("violet", "blue", "green", "amber", "rose");
        UserModel updated = user.updateProfile("traveler2", null, null)
                .updateProfileImage("users/1/profile/test.png").updateProfileImage(null);
        assertThat(updated.getDefaultAvatarColor()).isEqualTo(user.getDefaultAvatarColor());
    }

    @Test
    void legacyUserColorIsStableAcrossReconstruction() {
        var now = java.time.OffsetDateTime.now();
        UserModel first = UserModel.reconstruct(7L, "traveler", null, null, UserRole.USER, UserStatus.ACTIVE, now, now);
        UserModel second = UserModel.reconstruct(7L, "traveler", null, null, UserRole.USER, UserStatus.ACTIVE, now, now);
        assertThat(first.getDefaultAvatarColor()).isEqualTo(second.getDefaultAvatarColor());
    }

    @Test
    void reconstructedAvatarAndPhotoArePreservedByNormalProfileSave() {
        var now = java.time.OffsetDateTime.now();
        UserModel user = UserModel.reconstruct(7L, "traveler", null, null, null, "users/7/profile/test.png",
                "amber", UserRole.USER, UserStatus.ACTIVE, now, now);
        UserModel saved = user.updateProfile("traveler2", null, null);
        assertThat(saved.getDefaultAvatarColor()).isEqualTo("amber");
        assertThat(saved.getProfileImageKey()).isEqualTo("users/7/profile/test.png");
    }


    @Test
    void 소셜_가입은_name_없이_생성된다() {
        UserModel user = UserModel.create("hong gildong", null, null);

        assertThat(user.getUsername()).isEqualTo("hong gildong");
        assertThat(user.getName()).isNull();
        assertThat(user.getEmail()).isNull();
    }

    @Test
    void username은_한글_영문_숫자_이모지를_모두_허용한다() {
        assertThat(UserModel.create("길동", null, null).getUsername()).isEqualTo("길동");
        assertThat(UserModel.create("gildong99", null, null).getUsername()).isEqualTo("gildong99");
        assertThat(UserModel.create("여행가 🧳", null, null).getUsername()).isEqualTo("여행가 🧳");
    }

    @Test
    void username은_앞뒤_공백을_허용하지_않는다() {
        assertThatThrownBy(() -> UserModel.create(" 길동", null, null))
                .isInstanceOf(CoreException.class)
                .hasMessageContaining("username");
    }

    @Test
    void username은_연속_공백을_허용하지_않는다() {
        assertThatThrownBy(() -> UserModel.create("홍  길동", null, null))
                .isInstanceOf(CoreException.class)
                .hasMessageContaining("username");
    }

    @Test
    void username은_개행을_허용하지_않는다() {
        assertThatThrownBy(() -> UserModel.create("홍\n길동", null, null))
                .isInstanceOf(CoreException.class)
                .hasMessageContaining("username");
    }

    @Test
    void username은_2자_미만이거나_30자를_넘을_수_없다() {
        assertThatThrownBy(() -> UserModel.create("가", null, null))
                .isInstanceOf(CoreException.class);
        assertThatThrownBy(() -> UserModel.create("가".repeat(31), null, null))
                .isInstanceOf(CoreException.class);
    }

    @Test
    void name은_한글만_허용한다() {
        assertThat(UserModel.create("gildong", "홍길동", null).getName()).isEqualTo("홍길동");

        assertThatThrownBy(() -> UserModel.create("gildong", "Hong", null))
                .isInstanceOf(CoreException.class)
                .hasMessageContaining("name");
    }

    @Test
    void 프로필_수정은_username과_name을_함께_바꾼다() {
        UserModel user = UserModel.create("gildong", null, null);

        UserModel updated = user.updateProfile("길동이", "홍길동", "a@b.com");

        assertThat(updated.getUsername()).isEqualTo("길동이");
        assertThat(updated.getName()).isEqualTo("홍길동");
        assertThat(updated.getEmail()).isEqualTo("a@b.com");
    }
}
