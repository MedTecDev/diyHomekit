import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DIYHomebridgePlatform } from '../platform';

import { StatusPacket } from '../comm/packets';
import { Device } from './device';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Lightstripe {

    /** private variables */
    private device: Device;
    private service: Service;

    /** public variables **/
    public LOGGED_IN = false;
    public readonly LIGHT_ID;

    // stores the actual state of the accessory
    private lightState = {
        on: false, // true / false
        bri: 0, // min: 0, max: 100, step: 1
        hue: 0, // min: 0, max: 360, step: 1
        sat: 0, // min: 0, max: 100, step: 1
        ct: 140,  // min: 140, max: 500, step: 1
    };

    /** Constructor */
    constructor(private readonly platform: DIYHomebridgePlatform, private readonly accessory: PlatformAccessory, pDevice: Device) {

        this.device = pDevice;

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'MedTecDev')
            .setCharacteristic(this.platform.Characteristic.Model, 'Lightstripe')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, '123456789');

        this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
        this.LIGHT_ID = accessory.context.device.light;

        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/Lightbulb

        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.setON.bind(this))
            .onGet(this.getON.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.Hue)
            .onSet(this.setHUE.bind(this))
            .onGet(this.getHUE.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
            .onSet(this.setCT.bind(this))
            .onGet(this.getCT.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.Brightness)
            .onSet(this.setBRI.bind(this))
            .onGet(this.getBRI.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.Saturation)
            .onSet(this.setSAT.bind(this))
            .onGet(this.getSAT.bind(this));

        this.platform.log.debug('Constructed:', accessory.context.device.name);
    }

    /** GET Brightness **/
    private async getBRI() : Promise<CharacteristicValue> {
        // call generic method
        return this.getState(Math.round(this.lightState.bri));
    }

    /** GET Color Temperature **/
    private async getCT() : Promise<CharacteristicValue> {
        // call generic method
        return this.getState(Math.round(this.lightState.ct));
    }

    /** GET Hue **/
    private async getHUE() : Promise<CharacteristicValue> {
        // call generic method
        return this.getState(Math.round(this.lightState.hue));
    }

    /** GET On/Off **/
    private async getON(): Promise<CharacteristicValue> {
        // call generic method
        return this.getState(this.lightState.on);
    }

    /** GET On/Off **/
    private async getSAT(): Promise<CharacteristicValue> {
        // call generic method
        return this.getState(Math.round(this.lightState.sat));
    }

    /** Generic Method for GET Requests **/
    private async getState(state): Promise<CharacteristicValue> {
        // check if device is logged in
        if (this.LOGGED_IN) {
            // return the state
            return state;
        }
        // Throw communication error if device is not logged in
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    /** SET Brightness **/
    private async setBRI(value: CharacteristicValue) {
        // calculate brightness
        const brightness = parseInt(value.toString());
        // create new state
        const newstate : StatusPacket = {
            bri: brightness,
        };
        // call putValue()
        this.putValue(newstate);
        this.lightState.bri = +value;
    }

    /** SET Color Temperature **/
    private async setCT(value: CharacteristicValue) {
        this.platform.log.debug('Setting CT to', value);
        // create new state
        const newstate : StatusPacket = {
            ct: +value.toString(),
        };
        // call putValue()
        this.putValue(newstate);
        this.lightState.ct = +value;
    }

    /** SET Hue **/
    private async setHUE(value: CharacteristicValue) {
        this.platform.log.debug('Setting HUE to', value);
        // create new state
        const newstate : StatusPacket = {
            hue: +value.toString(),
        };
        // call putValue()
        this.putValue(newstate);
        this.lightState.hue = +value;
    }

    /** SET On/Off **/
    private async setON(value: CharacteristicValue) {
        let state = false;

        if(value === 'True' || value === 'true' || value) {
            state = true;
        }

        //save state
        this.lightState.on = state;

        // create new state
        const newstate : StatusPacket = {
            on: state,
        };
        // call putValue()
        this.putValue(newstate);
    }

    /** SET Hue **/
    private async setSAT(value: CharacteristicValue) {
        // calculate brightness
        const sat = parseInt(value.toString());
        // create new state
        const newstate : StatusPacket = {
            sat: +sat.toString(),
        };
        // call putValue()
        this.putValue(newstate);
        this.lightState.sat = +value;
    }

    /** Sets the state of the subdevice **/
    public setState(pState) {
        // change the light state to the parameter state
        this.lightState = pState;
    }

    public putValue(pStatus : StatusPacket) {
        // check if the device is logged in
        if (this.LOGGED_IN) {
            // put value
            this.device.putValueForAccessory(this.accessory.context.device.light, pStatus);
        } else {
            // Throw communication error if device is not logged in
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }
}
