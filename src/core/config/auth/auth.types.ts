export type JwtTokenConfig = {
  secret: string;
  expiresIn: string;
};

export type JwtConfig = {
  access: JwtTokenConfig;
  refresh: JwtTokenConfig;
};
