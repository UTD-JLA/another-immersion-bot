export type Stringifiable =
  | string
  | number
  | boolean
  | null
  | undefined
  | {toString(): string};
