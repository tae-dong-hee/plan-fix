import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import InvitationReturn from "./invitation-return";
import { consumeInvitationReturn, markKakaoInvitationReturn, readInvitationReturn, rememberInvitationReturn } from "@/lib/auth-return";

const path = "/invite#token=kakao-return_token";
function Destination() {
  const location = useLocation();
  return <p>{location.pathname}{location.hash}</p>;
}

function renderReturn(main = <p>메인 화면</p>) {
  return render(<StrictMode><MemoryRouter initialEntries={["/main"]}><Routes><Route path="/main" element={<InvitationReturn>{main}</InvitationReturn>} /><Route path="/invite" element={<Destination />} /></Routes></MemoryRouter></StrictMode>);
}

describe("InvitationReturn", () => {
  beforeEach(() => { sessionStorage.clear(); consumeInvitationReturn(); });

  test("Kakao success returns directly to the invitation even in StrictMode without mounting the main page", async () => {
    rememberInvitationReturn(path);
    markKakaoInvitationReturn();
    const Main = vi.fn(() => <p>메인 화면</p>);
    renderReturn(<Main />);
    expect(await screen.findByText(path)).toBeInTheDocument();
    expect(Main).not.toHaveBeenCalled();
    expect(readInvitationReturn()).toBeNull();
  });

  test("normal main visits are unchanged", () => {
    renderReturn();
    expect(screen.getByText("메인 화면")).toBeInTheDocument();
  });

  test("a password-login return does not redirect an unrelated main visit", () => {
    rememberInvitationReturn(path);
    renderReturn();
    expect(screen.getByText("메인 화면")).toBeInTheDocument();
    expect(readInvitationReturn()).toBe(path);
  });
});
