declare global {
  namespace Express {
    interface User {
      _id: string;
      username: string;
      displayName: string;
    }
  }
}

export {};
