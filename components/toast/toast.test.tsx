import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toast } from "./toast";

/* DESIGN.md fixes the lifetime at ~2.8s, so the tests pin that figure
   literally rather than reading it back from the component's own constant. */
const LIFETIME_MS = 2800;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("<Toast />", () => {
  it("announces the confirmation without taking focus away", () => {
    render(<Toast message="Acceso asignado" />);

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Acceso asignado");
    expect(toast).toHaveAttribute("aria-live", "polite");
    expect(document.body).toHaveFocus();
  });

  it("stays on screen for the whole 2.8s lifetime", () => {
    render(<Toast message="Acceso asignado" />);

    advance(LIFETIME_MS - 1);

    expect(screen.queryByRole("status")).not.toBeNull();
  });

  it("takes itself away once that lifetime is over", () => {
    render(<Toast message="Acceso asignado" />);

    advance(LIFETIME_MS);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("tells the owner it is gone so a queue can drop it", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Acceso asignado" onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();

    advance(LIFETIME_MS);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("honours a lifetime the caller overrides", () => {
    render(<Toast message="Acceso asignado" durationMs={1000} />);

    advance(999);
    expect(screen.queryByRole("status")).not.toBeNull();

    advance(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not dismiss after the owner has already unmounted it", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<Toast message="Acceso asignado" onDismiss={onDismiss} />);

    unmount();
    advance(LIFETIME_MS * 2);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("comes back for a new confirmation and restarts its lifetime", () => {
    const { rerender } = render(<Toast message="Acceso asignado" />);

    advance(LIFETIME_MS);
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<Toast message="Acceso revocado" />);
    expect(screen.getByRole("status")).toHaveTextContent("Acceso revocado");

    advance(LIFETIME_MS - 1);
    expect(screen.queryByRole("status")).not.toBeNull();

    advance(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not restart its lifetime just because the owner re-rendered", () => {
    const { rerender } = render(<Toast message="Acceso asignado" onDismiss={() => {}} />);

    advance(LIFETIME_MS - 100);
    rerender(<Toast message="Acceso asignado" onDismiss={() => {}} />);
    advance(100);

    expect(screen.queryByRole("status")).toBeNull();
  });
});
