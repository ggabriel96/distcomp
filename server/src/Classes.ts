import { Stringified } from "./Stringified";

export class Message extends Stringified {
  user: string;
  content: string;

  constructor(user: string, content: string) {
    super();
    if (!this.isValid(user)) throw new TypeError("user is undefined, null or empty");
    if (!this.isValid(content)) throw new TypeError("content is undefined, null or empty");
    this.user = user;
    this.content = content;
  }

  private isValid(field: string): boolean {
    return field !== undefined && field.length > 0;
  }
}

export enum RequestState {
  IDLE, INIT, BUSY
}
