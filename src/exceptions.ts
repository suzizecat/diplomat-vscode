

/**
 * Base error for all internal Diplomat Errors.
 */
export class DiplomatBaseError extends Error {
    constructor(message: string) {
        super(message); // Call the constructor of the base class `Error`
        this.name = "DiplomatBaseError"; // Set the error name to your custom error class name
		// Set the prototype explicitly to maintain the correct prototype chain
        Object.setPrototypeOf(this, DiplomatBaseError.prototype);
    }
}

/**
 * Any kind of issue that occured during the readout of the config file.
 */
export class ConfigFileReadError extends DiplomatBaseError {
    constructor(message: string) {
        super(message); // Call the constructor of the base class `Error`
        this.name = "ConfigFileReadError"; // Set the error name to your custom error class name
		// Set the prototype explicitly to maintain the correct prototype chain
        Object.setPrototypeOf(this, ConfigFileReadError.prototype);
    }
}
