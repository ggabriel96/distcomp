import { Stringified } from "./Stringified";
import { Stamp } from "itclocks";
import { IDs } from "itclocks";

export class Message extends Stringified {
  user: string;
  content: string;
  stamp: Stamp;

  constructor(user: string, content: string, stamp?: Stamp) {
    super();
    if (!this.isValid(user)) throw new TypeError("user is undefined, null or empty");
    if (!this.isValid(content)) throw new TypeError("content is undefined, null or empty");
    this.user = user;
    this.content = content;
    this.stamp = stamp;
  }

  private isValid(field: string): boolean {
    return field !== undefined && field.length > 0;
  }

  public static equals(a: Message, b: Message): boolean {
    return a.user === b.user && a.content === b.content && a.stamp.equals(b.stamp);
  }

  public static compare(a: Message, b: Message): number {
    if (Message.equals(a, b)) return 0;
    if (a.stamp.leq(b.stamp)) return -1;
    return 1;
  }
}

export enum RequestState {
  IDLE, INIT, BUSY
}
