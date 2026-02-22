export interface IConnectionAuthUserPassOption {
  user: string;
  password: string;
}

export interface IRPCConnectionOption {
  name?: string;
  url: string;
  auth?: IConnectionAuthUserPassOption;
  namespace?: string;
  database?: string;
  onDuplicateConnection?: 'use_existing' | 'overwrite' | 'throw';
}
