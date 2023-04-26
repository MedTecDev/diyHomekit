// Packet for login
export interface LOGIN_PACKET {
    mac: string;
    checksum: string;
}

// Packet for registration
export interface REGISTER_PACKET {
    name: string;
    mac: string;
}