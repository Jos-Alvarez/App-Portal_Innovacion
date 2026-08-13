import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./skeleton";

describe("<Skeleton />", () => {
  it("announces to assistive tech that content is loading", () => {
    render(<Skeleton />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando información");
  });

  it("uses the caller's label when the view names what is loading", () => {
    render(<Skeleton label="Cargando tus aplicaciones" />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando tus aplicaciones");
  });

  it("renders one shimmer block per described block", () => {
    render(<Skeleton blocks={[{ width: "40%" }, { width: "100%" }, { width: "80%" }]} />);

    expect(screen.getAllByTestId("skeleton-block")).toHaveLength(3);
  });

  it("renders a single shimmer block when the geometry describes only one", () => {
    render(<Skeleton blocks={[{ width: "50%" }]} />);

    expect(screen.getAllByTestId("skeleton-block")).toHaveLength(1);
  });

  it("falls back to one full-width block so the view is never blank", () => {
    render(<Skeleton />);

    const blocks = screen.getAllByTestId("skeleton-block");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveStyle({ width: "100%" });
  });

  it("shapes each block to the width and height it was given", () => {
    render(<Skeleton blocks={[{ width: "220px", height: "44px" }]} />);

    expect(screen.getByTestId("skeleton-block")).toHaveStyle({
      width: "220px",
      height: "44px",
    });
  });
});
