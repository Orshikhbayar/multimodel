import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockPush, mockRefresh, mockUpdateLocale, mockLogoutLocal } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockUpdateLocale: vi.fn(),
  mockLogoutLocal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/lib/state/hooks", () => ({
  useUser: () => ({
    id: "u1",
    name: "Demo User",
    email: "demo@example.com",
    avatarInitial: "D",
    plan: "free",
    locale: "en",
  }),
}));

vi.mock("@/lib/state/actions", () => ({
  updateLocale: mockUpdateLocale,
  logoutLocal: mockLogoutLocal,
}));

import { UserMenu } from "@/components/UserMenu";

describe("UserMenu", () => {
  it("opens menu and language modal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    render(<UserMenu />);

    fireEvent.click(screen.getByRole("button", { name: /demo user/i }));
    expect(screen.getByText("Settings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /language/i }));
    expect(screen.getByText(/select your display language/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/монгол/i));
    expect(mockUpdateLocale).toHaveBeenCalledWith("mn");

    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    fireEvent.click(screen.getByRole("button", { name: /demo user/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));
    await waitFor(() => {
      expect(mockLogoutLocal).toHaveBeenCalled();
    });
  });
});
