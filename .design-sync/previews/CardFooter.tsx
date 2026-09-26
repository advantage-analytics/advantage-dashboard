import { CardFooter } from "advantage-analytics-ds";

/** The hairline footer every Home card carries: what the card is a slice of, and how much there is. */
export function LeftAndRight() {
  return (
    <div style={{ maxWidth: 380 }}>
      <CardFooter left="Last 30 days" right="12 matches · 8 won" />
    </div>
  );
}

/** Left only, where the card has no count to state. */
export function LeftOnly() {
  return (
    <div style={{ maxWidth: 380 }}>
      <CardFooter left="From your last analyzed match" />
    </div>
  );
}
