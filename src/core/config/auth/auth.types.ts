export type JwtTokenOptions = {
  secret: string;
  expiresIn: string;
};

export type JwtOptions = {
  access: JwtTokenOptions;
  refresh: JwtTokenOptions;
};
