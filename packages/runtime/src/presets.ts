export const defaultCatch = [
  {
    ErrorEquals: ["States.ALL"],
    ResultPath: "$.error",
    Next: "__ErrorHandled__"
  }
];

export const defaultRetry = [
  {
    ErrorEquals: ["States.ALL"],
    IntervalSeconds: 2,
    BackoffRate: 2,
    MaxAttempts: 3
  }
];

