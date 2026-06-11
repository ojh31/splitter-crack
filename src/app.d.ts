declare global {
  namespace App {
    interface Locals {
      member: {
        id: string;
        groupId: string;
        name: string;
        loginToken: string;
      } | null;
    }
  }
}

export {};
