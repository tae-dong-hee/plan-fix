import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "@/App";
import LoginForm from "@/components/ui/login-form";
import SignupForm from "@/components/ui/signup-form";

const availableUsername = async () => ({ available: true, message: "사용 가능한 아이디입니다." });

function availabilityButton(label: string) {
  return within(screen.getByLabelText(label).parentElement!).getByRole("button", { name: "중복 확인" });
}

async function checkUsername() {
  fireEvent.click(availabilityButton("아이디"));
  expect(await screen.findByText("사용 가능한 아이디입니다.")).toBeInTheDocument();
}

test("renders the login screen", () => {
  render(
    <MemoryRouter
      initialEntries={["/login"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "카카오 로그인" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
  expect(screen.getByText(/아직 계정이 없으신가요/)).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "카카오 계정 도움말" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "카카오로 계속하기" })).not.toBeInTheDocument();
});

test("shows PlanFix validation messages when the login form is empty", () => {
  const handleSubmit = vi.fn();
  render(<LoginForm onSubmit={handleSubmit} />);

  fireEvent.submit(screen.getByRole("button", { name: "로그인" }).closest("form")!);

  expect(screen.getByLabelText("아이디")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("비밀번호")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect(screen.getByText("아이디를 입력해 주세요.")).toBeInTheDocument();
  expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeInTheDocument();
  expect(handleSubmit).not.toHaveBeenCalled();
});

test("tells the user to configure the API when Kakao login is unavailable", () => {
  render(
    <MemoryRouter
      initialEntries={["/login"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));

  // 테스트 환경에는 VITE_API_BASE_URL이 없으므로 안내만 뜨고 이동하지 않는다.
  expect(
    screen.getByText("카카오 로그인은 백엔드 연결이 필요합니다.", { exact: false }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "카카오로 계속하기" })).not.toBeInTheDocument();
});

test("opens the signup screen from the login screen", () => {
  render(
    <MemoryRouter initialEntries={["/login"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("link", { name: "회원가입" }));
  expect(screen.getByRole("heading", { name: "회원가입" })).toBeInTheDocument();
  expect(screen.getByRole("form", { name: "회원가입 정보" })).toBeInTheDocument();
});

test("shows the reason when the Kakao callback redirects back with an error", () => {
  render(
    <MemoryRouter
      initialEntries={["/login?error=denied"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByText("카카오 로그인을 취소했습니다.")).toBeInTheDocument();
});

test("falls back to a generic message for an unknown Kakao error code", () => {
  render(
    <MemoryRouter
      initialEntries={["/login?error=something-else"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  expect(
    screen.getByText("로그인 중 문제가 발생했습니다. 다시 시도해 주세요."),
  ).toBeInTheDocument();
});

test("keeps the signup screen available through its direct route", () => {
  render(
    <MemoryRouter
      initialEntries={["/signup"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: "회원가입" })).toBeInTheDocument();
  expect(screen.getByLabelText("아이디")).toBeInTheDocument();
  expect(screen.getByLabelText("이름")).toBeInTheDocument();
  expect(screen.getByLabelText("생년월일")).toBeInTheDocument();
  expect(screen.getByLabelText("이메일")).toBeInTheDocument();
  expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
  expect(screen.getByLabelText("비밀번호 확인")).toBeInTheDocument();
  expect(screen.getByLabelText("이름")).toHaveAttribute("spellcheck", "false");
  expect(screen.getByLabelText("이름")).toHaveAttribute("maxlength", "7");
});

test.each([
  ["한글 자음만 입력한 이름", "ㄴㄷㅇ"],
  ["띄어쓰기가 포함된 이름", "김 태용"],
  ["영문 이름", "Kim"],
  ["한글과 영문이 섞인 이름", "김Tae용"],
  ["한 글자 이름", "김"],
  ["여덟 글자 이름", "김가나다라마바사"],
])("shows a warning after leaving a %s", (_caseName, invalidName) => {
  render(<SignupForm />);

  const nameInput = screen.getByLabelText("이름");
  fireEvent.change(nameInput, {
    target: { value: invalidName },
  });
  fireEvent.blur(nameInput);

  expect(screen.getByRole("alert")).toHaveTextContent(
    "공백 없이 완성된 한글 2~7자로 입력해 주세요.",
  );
});

test("does not show warnings when leaving empty signup fields", () => {
  render(<SignupForm />);

  ["아이디", "이름", "생년월일", "이메일", "비밀번호", "비밀번호 확인"].forEach((label) => {
    fireEvent.blur(screen.getByLabelText(label));
  });

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("keeps format warnings after leaving invalid signup fields", () => {
  render(<SignupForm />);

  const loginIdInput = screen.getByLabelText("아이디");
  fireEvent.change(loginIdInput, { target: { value: "abc" } });
  fireEvent.blur(loginIdInput);

  const birthDateInput = screen.getByLabelText("생년월일");
  fireEvent.change(birthDateInput, { target: { value: "20261340" } });
  fireEvent.blur(birthDateInput);

  const emailInput = screen.getByLabelText("이메일");
  fireEvent.change(emailInput, { target: { value: "planfix@" } });
  fireEvent.blur(emailInput);

  const passwordInput = screen.getByLabelText("비밀번호");
  fireEvent.change(passwordInput, { target: { value: "password1" } });
  fireEvent.blur(passwordInput);

  const passwordConfirmationInput = screen.getByLabelText("비밀번호 확인");
  fireEvent.change(passwordConfirmationInput, { target: { value: "Password2" } });
  fireEvent.blur(passwordConfirmationInput);

  expect(screen.getByText("영문 소문자와 숫자로 6~20자로 입력해 주세요.")).toBeInTheDocument();
  expect(screen.getByText(
    "생년월일을 yyyy-mm-dd 형식에 맞게 입력해 주세요.",
  )).toBeInTheDocument();
  expect(screen.getByText("올바른 이메일 형식을 입력해 주세요.")).toBeInTheDocument();
  expect(screen.getByText(
    "영문·숫자를 조합하고 대문자를 1개 이상 포함해 8~20자로 입력해 주세요.",
  )).toBeInTheDocument();
  expect(screen.getByText("비밀번호가 일치하지 않습니다.")).toBeInTheDocument();
});

test("formats the signup birth date as yyyy-mm-dd", () => {
  render(<SignupForm />);

  const birthDateInput = screen.getByLabelText("생년월일");
  fireEvent.change(birthDateInput, { target: { value: "19900101" } });

  expect(birthDateInput).toHaveValue("1990-01-01");
  expect(birthDateInput).toHaveAttribute("maxlength", "10");
});

test("rejects an invalid signup birth date", async () => {
  render(<SignupForm onCheckUsernameAvailability={availableUsername} />);

  fireEvent.change(screen.getByLabelText("아이디"), {
    target: { value: "testuser1" },
  });
  await checkUsername();
  fireEvent.change(screen.getByLabelText("이름"), {
    target: { value: "김태용" },
  });
  fireEvent.change(screen.getByLabelText("생년월일"), {
    target: { value: "19901340" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "생년월일을 yyyy-mm-dd 형식에 맞게 입력해 주세요.",
  );
});

test("validates matching passwords on the signup form", async () => {
  const handleSubmit = vi.fn();
  render(
    <SignupForm
      onSubmit={handleSubmit}
      onCheckUsernameAvailability={availableUsername}
      onCheckEmailAvailability={async () => ({
        available: true,
        message: "사용 가능한 이메일입니다.",
      })}
    />,
  );

  fireEvent.change(screen.getByLabelText("아이디"), {
    target: { value: "testuser1" },
  });
  await checkUsername();
  fireEvent.change(screen.getByLabelText("이름"), {
    target: { value: "김태용" },
  });

  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "new@planfix.kr" },
  });
  fireEvent.click(availabilityButton("이메일"));
  expect(await screen.findByText("사용 가능한 이메일입니다.")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("비밀번호"), {
    target: { value: "Password1" },
  });
  fireEvent.change(screen.getByLabelText("비밀번호 확인"), {
    target: { value: "Password2" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));

  expect(screen.getByRole("alert")).toHaveTextContent("비밀번호가 일치하지 않습니다.");
  expect(handleSubmit).not.toHaveBeenCalled();
});

test("validates the signup password format", async () => {
  const handleSubmit = vi.fn();
  render(
    <SignupForm
      onSubmit={handleSubmit}
      onCheckUsernameAvailability={availableUsername}
      onCheckEmailAvailability={async () => ({
        available: true,
        message: "사용 가능한 이메일입니다.",
      })}
    />,
  );

  fireEvent.change(screen.getByLabelText("아이디"), {
    target: { value: "testuser1" },
  });
  await checkUsername();
  fireEvent.change(screen.getByLabelText("이름"), {
    target: { value: "김태용" },
  });

  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "new@planfix.kr" },
  });
  fireEvent.click(availabilityButton("이메일"));
  expect(await screen.findByText("사용 가능한 이메일입니다.")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("비밀번호"), {
    target: { value: "password1" },
  });
  fireEvent.change(screen.getByLabelText("비밀번호 확인"), {
    target: { value: "password1" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "영문·숫자를 조합하고 대문자를 1개 이상 포함해 8~20자로 입력해 주세요.",
  );
  expect(handleSubmit).not.toHaveBeenCalled();
});

test.each([
  ["두 글자", "가나"],
  ["일곱 글자", "김가나다라마바"],
])("accepts a %s Korean signup name and matching password", async (_nameType, signupName) => {
  const handleSubmit = vi.fn();
  render(
    <SignupForm
      onSubmit={handleSubmit}
      onCheckUsernameAvailability={availableUsername}
      onCheckEmailAvailability={async () => ({
        available: true,
        message: "사용 가능한 이메일입니다.",
      })}
    />,
  );

  fireEvent.change(screen.getByLabelText("아이디"), {
    target: { value: "testuser1" },
  });
  await checkUsername();
  fireEvent.change(screen.getByLabelText("이름"), {
    target: { value: signupName },
  });

  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "new@planfix.kr" },
  });
  fireEvent.click(availabilityButton("이메일"));
  expect(await screen.findByText("사용 가능한 이메일입니다.")).toBeInTheDocument();

  const passwordInput = screen.getByLabelText("비밀번호");
  const passwordConfirmationInput = screen.getByLabelText("비밀번호 확인");
  fireEvent.change(passwordInput, { target: { value: "Password1!" } });
  fireEvent.change(passwordConfirmationInput, { target: { value: "Password1!" } });
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));

  expect(passwordInput).not.toHaveAttribute("pattern");
  expect(passwordConfirmationInput).not.toHaveAttribute("pattern");
  expect(handleSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      loginId: "testuser1",
      name: signupName,
      password: "Password1!",
      passwordConfirmation: "Password1!",
    }),
  );
});

test("shows the email duplication result on the signup form", async () => {
  render(
    <SignupForm
      onCheckEmailAvailability={async () => ({
        available: false,
        message: "이미 사용 중인 이메일입니다.",
      })}
    />,
  );

  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "demo@planfix.kr" },
  });
  fireEvent.click(availabilityButton("이메일"));

  expect(await screen.findByRole("alert")).toHaveTextContent("이미 사용 중인 이메일입니다.");
});

test("renders the loading UI demo", () => {
  render(
    <MemoryRouter
      initialEntries={["/loading/demo"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: "로딩 UI" })).toBeInTheDocument();
  expect(screen.getAllByRole("status")).toHaveLength(5);
});

test("uses the jump loader while signing in", () => {
  render(<LoginForm isSubmitting />);

  expect(screen.getByRole("status", { name: "로딩 중" })).toBeInTheDocument();
  expect(screen.getByText("로그인 중...")).toBeInTheDocument();
});

test("renders the main screen", () => {
  render(
    <MemoryRouter
      initialEntries={["/main"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: "강원도 주간 날씨" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "지도에서 지역 선택: 강원도 전체" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "하단 메뉴" })).toBeInTheDocument();
});

test("opens the Gangwon map and applies the selected region", () => {
  render(
    <MemoryRouter
      initialEntries={["/main"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "지도에서 지역 선택: 강원도 전체" }),
  );

  expect(screen.getByRole("dialog", { name: "어디로 떠나볼까요?" })).toBeInTheDocument();
  expect(screen.getByText("PlanFix", { selector: "p" })).toBeInTheDocument();
  expect(
    screen.getByText(
      "지도에서 지역을 누르면 선택됩니다. 마우스뿐 아니라 키보드와 터치로도 이용할 수 있어요.",
    ),
  ).toBeInTheDocument();

  const regionNames = [
    "철원", "화천", "양구", "고성", "춘천", "홍천", "인제", "속초", "양양",
    "원주", "횡성", "평창", "강릉", "영월", "정선", "동해", "태백", "삼척",
  ];
  regionNames.forEach((region) => {
    expect(screen.getByRole("button", { name: region })).toBeInTheDocument();
  });

  const sokchoLabel = screen.getByRole("button", { name: "속초" }).querySelector("text");
  const yangyangLabel = screen.getByRole("button", { name: "양양" }).querySelector("text");
  expect(sokchoLabel).toHaveAttribute("font-size", "20");
  expect(sokchoLabel).not.toHaveAttribute("stroke-width");
  expect(sokchoLabel?.getAttribute("font-size")).toBe(yangyangLabel?.getAttribute("font-size"));
  expect(sokchoLabel).not.toHaveAttribute("stroke");

  const gangneungRegion = screen.getByRole("button", { name: "강릉" });
  const gangwonMap = screen.getByTestId("gangwon-boundary-map");

  fireEvent.pointerEnter(gangneungRegion);
  expect(gangwonMap).toHaveAttribute("data-active-region", "강릉");
  expect(screen.getByText("강릉", { selector: "p" })).toBeInTheDocument();
  expect(screen.getByLabelText("강릉 여행 키워드")).toHaveTextContent(
    "바다 산책커피 여행",
  );
  expect(screen.getByTestId("region-guide")).toHaveTextContent(
    "경포해변 · 안목 커피거리",
  );
  expect(screen.getByTestId("region-guide")).toHaveTextContent(
    "초당순두부 · 장칼국수",
  );

  fireEvent.pointerLeave(gangneungRegion);
  expect(gangwonMap).toHaveAttribute("data-active-region", "");
  expect(screen.queryByTestId("region-guide")).not.toBeInTheDocument();

  fireEvent.click(gangneungRegion);
  expect(screen.getByTestId("region-guide")).toHaveTextContent("초당순두부");
  fireEvent.click(screen.getByRole("button", { name: "강릉 선택하기" }));

  expect(screen.queryByRole("dialog", { name: "어디로 떠나볼까요?" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "강릉 주간 날씨" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "지도에서 지역 선택: 강원도 강릉" }),
  ).toBeInTheDocument();
});

test("touch selects a region without a hover preview moving the map before the click", () => {
  render(
    <MemoryRouter
      initialEntries={["/main"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "지도에서 지역 선택: 강원도 전체" }),
  );
  const region = screen.getByRole("button", { name: "정선" });

  for (const type of ["pointerover", "pointermove", "pointerdown"]) {
    // JSDOM does not implement PointerEvent's pointerType yet.
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerType", { value: "touch" });
    fireEvent(region, event);
    if (type === "pointerdown") expect(event.defaultPrevented).toBe(true);
  }
  fireEvent.mouseEnter(region);

  expect(screen.queryByTestId("region-guide")).not.toBeInTheDocument();
  expect(region).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(region);

  expect(region).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "정선 선택하기" })).toBeEnabled();
});

test("shows region guidance with keyboard selection", () => {
  render(
    <MemoryRouter
      initialEntries={["/main"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "지도에서 지역 선택: 강원도 전체" }),
  );

  const jeongseonRegion = screen.getByRole("button", { name: "정선" });
  fireEvent.focus(jeongseonRegion);

  expect(screen.getByTestId("region-guide")).toHaveTextContent(
    "정선아리랑시장 · 화암동굴",
  );
  expect(screen.getByTestId("region-guide")).toHaveTextContent(
    "곤드레밥 · 콧등치기국수",
  );

  fireEvent.keyDown(jeongseonRegion, { key: "Enter" });
  fireEvent.blur(jeongseonRegion);

  expect(screen.getByTestId("region-guide")).toHaveTextContent("콧등치기국수");
  expect(screen.getByRole("button", { name: "정선 선택하기" })).toBeEnabled();
});

test("closes the region map without changing the initial location", () => {
  render(
    <MemoryRouter
      initialEntries={["/main"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "지도에서 지역 선택: 강원도 전체" }),
  );
  fireEvent.keyDown(document, { key: "Escape" });

  expect(screen.queryByRole("dialog", { name: "어디로 떠나볼까요?" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "강원도 주간 날씨" })).toBeInTheDocument();
});

test("moves from the demo login to the main screen", async () => {
  render(
    <MemoryRouter
      initialEntries={["/login"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByPlaceholderText("아이디"), {
    target: { value: "demouser" },
  });
  fireEvent.change(screen.getByPlaceholderText("비밀번호"), {
    target: { value: "demo-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));

  expect(screen.getByRole("status", { name: "로딩 중" })).toBeInTheDocument();
  expect(
    await screen.findByRole("status", { name: "메인 화면을 준비하는 중" }, { timeout: 1500 }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "강원도 주간 날씨" })).not.toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "강원도 주간 날씨" }, { timeout: 3000 }),
  ).toBeInTheDocument();
});

test("renders the board detail screen on /boards/:boardId", async () => {
  render(
    <MemoryRouter
      initialEntries={["/boards/1"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );

  expect(await screen.findByText("게시글을 찾을 수 없어요.")).toBeInTheDocument();
});
