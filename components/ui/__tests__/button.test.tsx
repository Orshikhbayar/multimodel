import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button hover motion classes", () => {
  it("adds lift styling for default variant", () => {
    render(<Button>Run</Button>);

    const button = screen.getByRole("button", { name: "Run" });
    expect(button).toHaveClass("ui-hover-lift");
    expect(button).not.toHaveClass("ui-no-lift");
  });

  it("opts out of lift for link variant", () => {
    render(
      <Button variant="link">
        Docs
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Docs" });
    expect(button).toHaveClass("ui-hover-lift");
    expect(button).toHaveClass("ui-no-lift");
  });
});
