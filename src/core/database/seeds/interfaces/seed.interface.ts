export interface ISeed {
  name: string;
  run(): Promise<void>;
}
