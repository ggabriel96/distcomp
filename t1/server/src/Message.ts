import { Stringified } from "./Stringified";

export class Message extends Stringified {
    user: string;
    content: string;

    constructor(user: string, content: string) {
        super();
        this.user = user;
        this.content = content;
    }

    isValid(): boolean {
        return this.isValidField(this.user) && this.isValidField(this.content);
    }

    private isValidField(field: string): boolean {
        return typeof field !== "undefined" && field !== null && field.length > 0;
    }
}