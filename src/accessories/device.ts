import { PlatformAccessory } from 'homebridge';
import { StatusPacket } from '../comm/packets';
import { DIYHomebridgePlatform } from '../platform';
import { Lightstripe } from './lightstripe';

import fetch from 'node-fetch';


// throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)

export class Device {

    /** private variables **/
    // list of subdevices
    private subDevices : Lightstripe[] = [];
    // list of subAccessories
    private subAccessories : PlatformAccessory[];
    // ip address for device
    private ip = '';
    // plattfrom
    private readonly platform: DIYHomebridgePlatform;
    // heartbeat interval ID
    private interval_id;
    private missed_beats = 0;

    /** public variables **/
    public LOGGED_IN : boolean;
    public MAC: string;

    /** Constructor */
    constructor(pSubAccessories : PlatformAccessory[], pPlatform: DIYHomebridgePlatform, pMAC: string) {
        // set logged in to false
        this.LOGGED_IN = false;
        // set subAccessroies
        this.subAccessories = pSubAccessories;
        // set plattform
        this.platform = pPlatform;
        // set MAC
        this.MAC = pMAC;
        // start all accessories
        if (this.startSubdevices()) {
            this.platform.log.debug('Started Subdevices');
        }
    }

    // method to login the devices
    public login(pIP : string) : boolean {
        // Logging
        this.platform.log.debug('DEBUG [device.login] Device', this.MAC, 'logged in with', pIP);
        // check if device is already logged in
        if (!this.LOGGED_IN) {
            // set LOGGED_IN to true
            this.LOGGED_IN = true;
            // save ip address
            this.ip = pIP;
            // for all subdevices
            this.subDevices.forEach(subDevice => {
                // set LOGGED_IN to true for the subdevice
                subDevice.LOGGED_IN = true;
            });
            // register heartbeat
            this.registerHeartbeat();
            // device logged in
            return true;
        } else {
            // Logging
            this.platform.log.debug('DEBUG [device.login] Device was already logged in.');
            // if device was already logged in
            return true;
        }
    }

    private logout() {
        // for all subdevices
        this.subDevices.forEach(subDevice => {
            // set LOGGED_IN to true for the subdevice
            subDevice.LOGGED_IN = false;
        });
        // set the device to logged out
        this.LOGGED_IN = false;
        // unregister hearbeats
        this.unregisterHeartbeat();
    }

    // method to launch all subdevices
    private startSubdevices() : boolean {
        // start every subaccessory
        this.subAccessories.forEach(accessory => {
            // push all accessories to the subdevice list
            this.subDevices.push(new Lightstripe(this.platform, accessory, this));
        });
        return true;
    }

    /** GET StatusPackets **/
    private async getActualState() : Promise<boolean> {
        // Logging
        this.platform.log.debug('DEBUG [device.getActualState] Requesting actual state');
        // execute fetch
        return fetch('http://' + this.ip + '/state', { method: 'GET', headers: { Accept: 'application/json' }})
            .then( response => response.json())
            .then( json => {
                return this.syncAccessories(JSON.parse(JSON.stringify(json)));
            })
            .catch((e) => {
                // TODO throw errors and logout accessories
                if (e instanceof Error) {
                    this.platform.log.error('ERROR [device.getActualState]', e.name, '-', e.message);
                }
                return false;
            });
    }

    /** Synchronize Accessories **/
    private syncAccessories(responseObj) : boolean {
        // success indicator
        let successful = true;
        // Logging
        this.platform.log.debug(JSON.stringify(responseObj));
        // for each subdevice
        this.subDevices.forEach(subDevice => {
            // check if values are correct
            if (typeof responseObj[(subDevice.LIGHT_ID - 1).toString()]['on'] === undefined) {
                // set success indicator to false
                successful = false;
            }
            // set the state for subdevice
            subDevice.setState({
                on: responseObj[(subDevice.LIGHT_ID - 1).toString()]['on'],
                bri: Math.round(responseObj[(subDevice.LIGHT_ID - 1).toString()]['bri']),
                hue: Math.round(responseObj[(subDevice.LIGHT_ID - 1).toString()]['hue']),
                sat: Math.round(responseObj[(subDevice.LIGHT_ID - 1).toString()]['sat']),
                ct: Math.round(responseObj[(subDevice.LIGHT_ID - 1).toString()]['ct']),
            });
        });
        if (!successful) {
            this.platform.log.warn('WARN [device.syncAccessories] Reading Statuspacket was not successful');
        }
        // return value
        return successful;
    }

    /** PUT StatusPackets **/
    public async putValueForAccessory(pLight: number, data : StatusPacket) {
        // create packet
        const packet = {};
        // set data for the correct light
        packet[pLight] = data;
        this.platform.log.debug(JSON.stringify(packet));

        fetch('http://' + this.ip + '/state', {
            method: 'PUT',
            body: JSON.stringify(packet),
            headers: { 'Content-Type': 'application/json' }})
            .then(response => {
                if(!response.ok) {
                    // TODO implement better error handling
                    this.platform.log.error('Response was', response.status);
                }
            })
            .catch((e) => {
                if (e instanceof Error) {
                    // TODO implement better error handling
                    this.platform.log.error(e.name, e.message);
                }
            });
    }

    private registerHeartbeat() {
        // register intval execution
        this.interval_id = setInterval(() => this.heartbeat(), this.platform.config.updateInterval * 1000);
    }

    private async heartbeat() {
        // Await Heartbeat response
        this.getActualState().then(success => {
            // if we receive a valid response
            if (success) {
                // set missed beats to 0
                this.missed_beats = 0;
            } else {
                // enhance missed beats by 1
                this.missed_beats = this.missed_beats + 1;
                // Logging
                this.platform.log.debug('Device', this.MAC, 'missed', this.missed_beats, 'heartbeat');
            }
            // if 3 heartbeats are missed
            if (this.missed_beats >= 3) {
                // Logging
                this.platform.log.warn('Device', this.MAC, 'timed out. Logging out');
                // reset missed beats
                this.missed_beats = 0;
                // logout this device
                this.logout();
            }
        });

    }

    private unregisterHeartbeat() {
        // Logging
        this.platform.log.debug('Unregistering Heartbeat checks');
        // delete the interval
        clearInterval(this.interval_id);
    }
}
