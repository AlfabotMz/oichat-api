export const WHATSAPPJID_REGEX = /^(\d{10,15})@s\.whatsapp\.net$/
export const WHATSAPPLID_REGEX = /^\d{10,20}@lid$/

export class ID {
    private value: string;

    constructor(value: string) {
      this.value = value;
    }

    public toString(): string {
      return this.value;
    }

    static from(val: string) {
        return new ID(val)
    }
}

export class WhatsappJid {
    private value: string;
    // 840328723 - 
    constructor(value: string) {
        if (!value.match(WHATSAPPJID_REGEX)) {
            throw new Error("Invalid WhatsappJid format");
        }
        this.value = value;
    }

    public toString(): string {
      return this.value;
    }

    static from(val: string) {
        return new WhatsappJid(val)
    }

    public getWhatsapp(): string {
        return this.value.split("@")[0]
    }

}

export class WhatsappLid {
    private value: string;
    // 840328723 - 
    constructor(value: string) {
        if (!value.match(WHATSAPPLID_REGEX)) {
            throw new Error("Invalid WhatsappLid format");
        }
        this.value = value;
    }

    public toString(): string {
      return this.value;
    }

    static from(val: string) {
        return new WhatsappLid(val)
    }

}
