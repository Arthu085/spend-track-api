import { StringValue } from 'ms';

export type JwtTokenOptions = {
  secret: string;
  expiresIn: StringValue | number;
};

export type JwtOptions = {
  access: JwtTokenOptions;
  refresh: JwtTokenOptions;
};
