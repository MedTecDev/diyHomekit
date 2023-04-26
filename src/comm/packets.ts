
// {"on":true,"bri":144,"xy":[0,0],"ct":447,"hue":0,"sat":254,"colormode":"ct"}

export interface StatusPacket {
    on?: boolean;
    bri?: number;
    xy?: number[];
    ct?: number;
    hue?: number;
    sat?: number;
    colormode?: string;
  }