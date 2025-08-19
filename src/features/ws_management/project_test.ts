/**
 * This class represents a "testsuite" linked to a project.
 * It avoids the full lookup in the workspace for such things.
 * @remarks
 *
 * This class is used to save the discovery results of a testsuite lookup.
 * 
 * This class is not made to handle the test itself but can be used/updated by the
 * test handler.
 *
 * @alpha
 */
export abstract class BaseProjectTests {

    // !Static Methods

    // !Private (and/or readonly) Properties

    // !Constructor Function
    constructor(readonly mainFile : string){}

    // !Getters and Setters

    // !Public Instance Methods

    /**
     * This function refresh the testlist
     */
    abstract refreshTests() : void; 

    // !Private Subroutines

}