import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be declared before importing the hook
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { useAuth } from "@/hooks/use-auth";

// A minimal project shape returned by createProject / getProjects
function makeProject(id: string, name = "A Project") {
  return {
    id,
    name,
    messages: "[]",
    data: "{}",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────
  // Initial state
  // ──────────────────────────────────────────────
  describe("initial state", () => {
    it("starts with isLoading false", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    it("exposes signIn and signUp functions", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signIn).toBe("function");
      expect(typeof result.current.signUp).toBe("function");
    });
  });

  // ──────────────────────────────────────────────
  // signIn
  // ──────────────────────────────────────────────
  describe("signIn", () => {
    describe("loading state", () => {
      it("is true while the request is in-flight", async () => {
        let resolveSignIn!: (v: { success: boolean }) => void;
        const pending = new Promise<{ success: boolean }>((r) => {
          resolveSignIn = r;
        });
        vi.mocked(signInAction).mockReturnValue(pending as any);

        const { result } = renderHook(() => useAuth());

        // Start the call without awaiting
        act(() => {
          result.current.signIn("user@example.com", "pass");
        });

        expect(result.current.isLoading).toBe(true);

        // Resolve and let state settle
        await act(async () => {
          resolveSignIn({ success: false });
          await pending;
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false after a successful call", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: false });
        vi.mocked(getAnonWorkData).mockReturnValue(null);
        vi.mocked(getProjects).mockResolvedValue([makeProject("p1")]);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false even when signInAction throws", async () => {
        vi.mocked(signInAction).mockRejectedValue(new Error("Network failure"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await expect(
            result.current.signIn("user@example.com", "pass")
          ).rejects.toThrow("Network failure");
        });

        expect(result.current.isLoading).toBe(false);
      });
    });

    describe("on failure (success: false)", () => {
      it("returns the error result from the action", async () => {
        vi.mocked(signInAction).mockResolvedValue({
          success: false,
          error: "Invalid credentials",
        });

        const { result } = renderHook(() => useAuth());
        let returnValue: unknown;
        await act(async () => {
          returnValue = await result.current.signIn(
            "user@example.com",
            "wrongpass"
          );
        });

        expect(returnValue).toEqual({
          success: false,
          error: "Invalid credentials",
        });
      });

      it("does not navigate on failure", async () => {
        vi.mocked(signInAction).mockResolvedValue({
          success: false,
          error: "Invalid credentials",
        });

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "wrongpass");
        });

        expect(mockPush).not.toHaveBeenCalled();
        expect(createProject).not.toHaveBeenCalled();
      });
    });

    describe("on success — with anonymous work", () => {
      it("creates a project from the anon work data", async () => {
        const anonWork = {
          messages: [{ role: "user", content: "Make a button" }],
          fileSystemData: { "/App.jsx": { type: "file", content: "<Button/>" } },
        };
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(anonWork);
        vi.mocked(createProject).mockResolvedValue(makeProject("anon-proj"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(createProject).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: anonWork.messages,
            data: anonWork.fileSystemData,
          })
        );
      });

      it("clears the anonymous work after saving", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue({
          messages: [{ role: "user", content: "hi" }],
          fileSystemData: {},
        });
        vi.mocked(createProject).mockResolvedValue(makeProject("anon-proj"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(clearAnonWork).toHaveBeenCalledOnce();
      });

      it("redirects to the newly created project", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue({
          messages: [{ role: "user", content: "hi" }],
          fileSystemData: {},
        });
        vi.mocked(createProject).mockResolvedValue(makeProject("anon-proj-42"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/anon-proj-42");
        // Should not call getProjects when anon work exists
        expect(getProjects).not.toHaveBeenCalled();
      });
    });

    describe("on success — anonymous work present but with no messages", () => {
      it("falls through to the projects list (ignores empty anon work)", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        // getAnonWorkData returns a record with an empty messages array
        vi.mocked(getAnonWorkData).mockReturnValue({
          messages: [],
          fileSystemData: {},
        });
        vi.mocked(getProjects).mockResolvedValue([makeProject("existing-proj")]);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(clearAnonWork).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/existing-proj");
      });
    });

    describe("on success — no anonymous work, existing projects", () => {
      it("redirects to the most recent project (first in list)", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(null);
        vi.mocked(getProjects).mockResolvedValue([
          makeProject("most-recent"),
          makeProject("older"),
        ]);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/most-recent");
        expect(createProject).not.toHaveBeenCalled();
      });
    });

    describe("on success — no anonymous work, no existing projects", () => {
      it("creates a blank new project", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(null);
        vi.mocked(getProjects).mockResolvedValue([]);
        vi.mocked(createProject).mockResolvedValue(makeProject("fresh-proj"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(createProject).toHaveBeenCalledWith(
          expect.objectContaining({ messages: [], data: {} })
        );
      });

      it("redirects to the newly created blank project", async () => {
        vi.mocked(signInAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(null);
        vi.mocked(getProjects).mockResolvedValue([]);
        vi.mocked(createProject).mockResolvedValue(makeProject("fresh-proj"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/fresh-proj");
      });
    });
  });

  // ──────────────────────────────────────────────
  // signUp — mirrors signIn post-auth logic
  // ──────────────────────────────────────────────
  describe("signUp", () => {
    describe("loading state", () => {
      it("resets isLoading to false after a successful call", async () => {
        vi.mocked(signUpAction).mockResolvedValue({ success: false });

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signUp("new@example.com", "pass");
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false even when signUpAction throws", async () => {
        vi.mocked(signUpAction).mockRejectedValue(new Error("Server error"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await expect(
            result.current.signUp("new@example.com", "pass")
          ).rejects.toThrow("Server error");
        });

        expect(result.current.isLoading).toBe(false);
      });
    });

    describe("on failure (success: false)", () => {
      it("returns the error result and does not navigate", async () => {
        vi.mocked(signUpAction).mockResolvedValue({
          success: false,
          error: "Email already registered",
        });

        const { result } = renderHook(() => useAuth());
        let returnValue: unknown;
        await act(async () => {
          returnValue = await result.current.signUp(
            "existing@example.com",
            "pass"
          );
        });

        expect(returnValue).toEqual({
          success: false,
          error: "Email already registered",
        });
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    describe("on success — with anonymous work", () => {
      it("saves the anon work to a project, clears it, and redirects", async () => {
        const anonWork = {
          messages: [{ role: "user", content: "Build a form" }],
          fileSystemData: { "/App.jsx": { content: "..." } },
        };
        vi.mocked(signUpAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(anonWork);
        vi.mocked(createProject).mockResolvedValue(makeProject("signup-anon-proj"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signUp("new@example.com", "pass");
        });

        expect(createProject).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: anonWork.messages,
            data: anonWork.fileSystemData,
          })
        );
        expect(clearAnonWork).toHaveBeenCalledOnce();
        expect(mockPush).toHaveBeenCalledWith("/signup-anon-proj");
      });
    });

    describe("on success — no anonymous work, no projects (typical new user)", () => {
      it("creates a blank project and redirects", async () => {
        vi.mocked(signUpAction).mockResolvedValue({ success: true });
        vi.mocked(getAnonWorkData).mockReturnValue(null);
        vi.mocked(getProjects).mockResolvedValue([]);
        vi.mocked(createProject).mockResolvedValue(makeProject("brand-new"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signUp("new@example.com", "pass");
        });

        expect(createProject).toHaveBeenCalledWith(
          expect.objectContaining({ messages: [], data: {} })
        );
        expect(mockPush).toHaveBeenCalledWith("/brand-new");
      });
    });
  });
});
