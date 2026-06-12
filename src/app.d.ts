declare global {
  namespace App {
    interface Locals {
      user: {
        id: string;
        loginToken: string;
      } | null;
    }
  }
}

export {};
