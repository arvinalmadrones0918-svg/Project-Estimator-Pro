import { describe, test, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBanner from "../components/ErrorBanner";
import Spinner from "../components/Spinner";
import BottomSummaryBar from "../workspace/BottomSummaryBar";
import AnimatedNumber from "../analytics/AnimatedNumber";

describe("ErrorBanner", () => {
  test("renders nothing without a message", () => {
    const { container } = render(<ErrorBanner message="" />);
    expect(container).toBeEmptyDOMElement();
  });
  test("shows the message and calls onDismiss", async () => {
    const onDismiss = vi.fn();
    render(<ErrorBanner message="Boom" onDismiss={onDismiss} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    await userEvent.click(screen.getByLabelText("Dismiss error"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("Spinner", () => {
  test("renders a status with the default label", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });
  test("renders a custom label", () => {
    render(<Spinner label="Crunching numbers" />);
    expect(screen.getByText("Crunching numbers")).toBeInTheDocument();
  });
});

describe("BottomSummaryBar", () => {
  test("renders the cost-type totals and final tender price", () => {
    render(<BottomSummaryBar totals={{
      materialCost: 100, laborCost: 50, equipmentCost: 0, subcontractCost: 0,
      otherCost: 0, directCost: 150, finalTenderPrice: 200,
    }} />);
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
    expect(screen.getByText("Final Tender Price")).toBeInTheDocument();
  });
});

describe("AnimatedNumber", () => {
  test("counts up to the target value", async () => {
    // Deterministically deliver a completed animation frame (jsdom does not
    // advance rAF reliably). The clamped easing then resolves to the target.
    const raf = vi.spyOn(global, "requestAnimationFrame").mockImplementation((cb) => {
      cb(performance.now() + 10000);
      return 1;
    });
    render(<AnimatedNumber value={500} duration={50} />);
    await waitFor(() => expect(screen.getByText("500")).toBeInTheDocument());
    raf.mockRestore();
  });
});
