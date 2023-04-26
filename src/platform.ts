import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { DIYWebserver } from './webserver/webserver';

import { LOGIN_PACKET, REGISTER_PACKET } from './webserver/comm/request_packets';
import { Md5 } from 'ts-md5';
import { LOGIN_REPONSE_CODE, REGISTER_REPONSE_CODE } from './webserver/comm/response_codes';
import { Device } from './accessories/device';

export class DIYHomebridgePlatform implements DynamicPlatformPlugin {

    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
    public readonly accessories: PlatformAccessory[] = [];
    public readonly devices : Device[] = [];
    public readonly config_checksums = {};
    public readonly webserver: DIYWebserver;

    constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API ) {
        // Logging
        this.log.debug('DEBUG [platform.constructor] Finished initializing platform:', this.config.name);
        // Start DIYWebserver
        this.webserver = new DIYWebserver(this, this.config.webserver_port);

        this.api.on('didFinishLaunching', () => {
            this.log.debug('DEBUG [platform.constructor] Did finish launching!');
            // check the configuration
            this.checkConfiguration();
            // launch all devices
            this.config['deviceList'].forEach(element => {
                if (element.mac !== '') {
                    this.startDevice(element.mac);
                }
            });
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        // Load accessories from cache
        this.log.info('INFO [platform.configureAccessory] Loading accessory from cache:', accessory.displayName);
        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
    }

    loginAccessory(pPacket: LOGIN_PACKET, pIP : string): LOGIN_REPONSE_CODE {
        // Logging
        this.log.debug('DEBUG [platform.loginAccessory] Device', pPacket.mac, 'trying to authenticate with', pPacket.checksum);
        // if device is not configured or not registered
        if (!this.config_checksums[pPacket.mac]) {
            // Logging
            this.log.debug('DEBUG [platform.loginAccessory] Could not find a checksum for:', pPacket.mac);
            // return internal response code
            return LOGIN_REPONSE_CODE.LOGIN_FAILED_NOT_REGISTERED;
        }
        // Verify the correct configuration
        if (this.config_checksums[pPacket.mac] === pPacket.checksum) {
            // Logging
            this.log.debug('DEBUG [platform.loginAccessory] Checksums correct for:', pPacket.mac);
            // start the accessories of the device
            if (this.getDevice(pPacket.mac)?.login(pIP)) {
                // return internal response code
                return LOGIN_REPONSE_CODE.LOGIN_SUCCESSFULL;
            }
            // return internal response code
            return LOGIN_REPONSE_CODE.LOGIN_FAILED_INTERNAL_ERROR;
        } else {
            // Logging
            this.log.debug('DEBUG [platform.loginAccessory] Checksums incorrect for:', pPacket.mac);
            // return internal response code
            return LOGIN_REPONSE_CODE.LOGIN_FAILED_WRONG_CHECKSUM;
        }
    }

    registerAccessory(pPacket: REGISTER_PACKET) : REGISTER_REPONSE_CODE {
        // generate UUID for the Light
        const uuid = this.api.hap.uuid.generate(pPacket.mac);
        // Logging
        this.log.debug('DEBUG [platform.registerAccessory] Generated UUID:', uuid);
        // check if the device is existing
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        // If device is already existing
        if (existingAccessory) {
            // Logging
            this.log.info('INFO [platform.registerAccessory]', existingAccessory.displayName, 'tried to Register. Rejecting.');
            // unregister it from the plattform
            return REGISTER_REPONSE_CODE.REGISTRATION_FAILED_ALREADY_REGISTERED;
        } else {
            // Create Accessory (just with one light)
            this.createAccessory(pPacket.name, uuid, 1);
            // return true as registration was successful
            return REGISTER_REPONSE_CODE.REGISTRATION_SUCCESSFULL;
        }
    }

    loadDeviceConfig(pMAC: string) {
        // for each device in the config file
        if (this.config['deviceList'].some(element => element.mac === pMAC)) {
            // Logging
            this.log.debug('DEBUG [platform.loadDeviceConfig] Loading device configuration for:', pMAC);
            // Load device configuration
            const deviceConfig = this.config['deviceList'].find(element => element.mac=== pMAC);
            // Logging
            this.log.debug('DEBUG [platform.loadDeviceConfig]', JSON.stringify(deviceConfig));
            // return false as device is already in config
            return deviceConfig;
        } else {
            // Logging
            this.log.warn('DEBUG [platform.loadDeviceConfig] No configuration for', pMAC, 'found. The device will not work as long as there is no valid configuration.');
            // return null if there is no configuration for the device
            return null;
        }
    }

    getConfigChecksum(pMAC) : string {
        // check if checksum exists for a device
        if (this.config_checksums[pMAC]) {
            // return the checksum
            return this.config_checksums[pMAC];
        } else {
            // return an empty string
            return '';
        }
    }

    private checkConfiguration() {
        // check if all devices that should exist are existing
        this.config['deviceList'].forEach(element => {
            // generate checksum
            this.config_checksums[element['mac']] = Md5.hashStr(JSON.stringify(element));
            // Logging
            this.log.debug('DEBUG [platform.checkConfiguration] MD5 configuration checksum for', element['mac'], 'is', this.config_checksums[element['mac']]);
            // get count of lightstripes for this device
            const lightstripes_count = element['sub'].length;
            // if device is unconfigured or just one lightstripe
            if (lightstripes_count === 0 || lightstripes_count === 1) {
                // For each light (and one more) of the mac address
                for (let i = 0; i < 9; i++) {
                    // delete all other accessories if there were multiple
                    this.accessoryDeleteIfExists(element['mac'] + '_' + (i + 1));
                }
                // create an accessory
                this.accessoryExistsOrCreate(element['n'], element['mac'], 1);
            } else {
                // delete the first accessory if there are multiple lightstripes
                this.accessoryDeleteIfExists(element['mac']);
                // For each light (and one more) of the mac address
                for (let i = 0; i < lightstripes_count; i++) {
                    // create an accessory
                    this.accessoryExistsOrCreate(element['n']+ '_' + (i + 1), element['mac'] + '_' + (i + 1), i + 1);
                }
            }
        });
    }

    private accessoryExistsOrCreate(pName: string, pID : string, pLight : number) {
        // Logging
        this.log.debug('DEBUG [platform.accessoryExistsOrCreate] for', pName, 'with seed', pID);
        // generate UUID for the Light
        const uuid = this.api.hap.uuid.generate(pID);
        // check if the device is existing
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        // If device is already existing
        if (!existingAccessory) {
            // Logging
            this.log.debug('DEBUG [platform.accessoryExistsOrCreate] Accesory is not existing yet, creating...');
            // Register it from the plattform
            this.createAccessory(pName, uuid, pLight);
        }
    }

    private accessoryDeleteIfExists(pID: string) {
        // Logging
        this.log.debug('DEBUG [platform.accessoryDeleteIfExists] with seed', pID);
        // generate UUID for the Light
        const uuid = this.api.hap.uuid.generate(pID);
        // check if the device is existing
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        // If device is existing
        if (existingAccessory) {
            // Logging
            this.log.debug('DEBUG [platform.accessoryDeleteIfExists] Accesory is existing, deleting...');
            // add the accessory to the accessories cache
            const index = this.accessories.indexOf(existingAccessory);
            // if accessory exists in the array
            if (index > -1) {
                // remove the accessory from the array
                this.accessories.splice(index, 1);
            }
            // register as plattform accessory
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        }
    }

    private createAccessory(pName : string, pUUID: string, pLight: number) {
        // Logging
        this.log.info('Registering new Accessory:', pName);
        // create accessory
        const accessory = new this.api.platformAccessory(pName, pUUID);
        // give the new device its context
        accessory.context.device = { name: pName, light : pLight };
        // add the accessory to the accessories cache
        this.accessories.push(accessory);
        // register as plattform accessory
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    private startDevice(pMAC: string): boolean {
        // Logging
        this.log.debug('DEBUG [platform.startDeviceAccessories] Trying to start devices for', pMAC);
        // for each device in the config file
        if (this.config['deviceList'].find(element => element.mac === pMAC)) {
            // Load Accessories
            const deviceAccessories = this.getAccessories(pMAC);
            // check if accessories are null
            if(deviceAccessories.length !== 0) {
                // start new device
                this.devices.push(new Device(deviceAccessories, this, pMAC));
                // return true
                return true;
            }
            // return false as uuids were null
            return false;
        } else {
            // Logging
            this.log.error('ERROR [platform.startDeviceAccessories] while starting accessory. No configuration for', pMAC, 'found.');
            // return false as the start of the accessories failed
            return false;
            // TODO End already started accessories of the device
        }
    }

    private getDevice(pMAC: string) : Device | undefined {
        // find the device
        const device = this.devices.find(element => element.MAC === pMAC);
        // check if undefined
        if (typeof device === undefined) {
            this.log.warn('Platform tried to get a undefined device with mac:', pMAC);
        }
        // return device
        return device;
    }

    private getUUIDs(pMAC: string):string[] {
        // create variable for uuid
        const uuids : string[] = [];
        // Load device configuration
        const deviceConfig = this.config['deviceList'].find(element => element.mac === pMAC);
        // check if a configuration was found
        if(typeof deviceConfig === undefined) {
            // Logging
            this.log.error('ERROR [platform.getUUIDs] Could not find a config for the device', pMAC);
            // Return empty array
            return [];
        }
        // get number of lights from config
        const accessorie_count = deviceConfig['sub'].length;
        // if multiple lights (more then 1)
        if (accessorie_count > 1) {
            // Logging
            this.log.debug('DEBUG [platform.getUUIDs] Generatings UUIDs for', accessorie_count, 'lights.');
            // for each accessorie
            for (let i = 1; i <= accessorie_count; i++) {
                // Logging
                this.log.debug('DEBUG [platform.getUUIDs] Using seed:', (pMAC + '_' + i));
                // generate UUID for the Light
                uuids.push(this.api.hap.uuid.generate(pMAC + '_' + i));
            }
        } else {
            // Logging
            this.log.debug('DEBUG [platform.getUUIDs] Generatings UUID for single light.');
            // Logging
            this.log.debug('DEBUG [platform.getUUIDs] Using seed:', pMAC);
            // generate UUID for the Light
            uuids.push(this.api.hap.uuid.generate(pMAC));
        }
        // return the array of uuids
        return uuids;
    }

    private getAccessories(pMAC: string):PlatformAccessory[] {
        // Logging
        this.log.debug('DEBUG [platform.getAccessories] Loading accessories for device:', pMAC);
        // create an empty array
        const deviceAccessories: PlatformAccessory[] = [];
        // load uuids for mac
        const uuids = this.getUUIDs(pMAC);
        // check if uuids are null or undefined
        if (uuids.length !== 0) {
            // for each uuid in uuids
            uuids.forEach(element => {
                // get the accessorie
                const existingAccessory = this.accessories.find(accessory => accessory.UUID === element);
                // check if the accessorie is existing
                if (existingAccessory) {
                    // add it to deviceAccessories
                    deviceAccessories.push(existingAccessory);
                } else {
                    // Logging
                    this.log.error('ERROR [platform.getAccessories] Could not load accessory for device:', pMAC, 'with UUID:', element);
                    // return null if there was one accessory which was invalid
                    return [];
                }
            });
        }
        // return null if uuids were null or undefined
        return deviceAccessories;
    }
}
