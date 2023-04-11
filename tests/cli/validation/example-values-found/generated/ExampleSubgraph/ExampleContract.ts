// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import {
  ethereum,
  JSONValue,
  TypedMap,
  Entity,
  Bytes,
  Address,
  BigInt
} from "@graphprotocol/graph-ts";

export class ExampleEvent extends ethereum.Event {
  get params(): ExampleEvent__Params {
    return new ExampleEvent__Params(this);
  }
}

export class ExampleEvent__Params {
  _event: ExampleEvent;

  constructor(event: ExampleEvent) {
    this._event = event;
  }

  get param0(): string {
    return this._event.parameters[0].value.toString();
  }
}

export class ExampleContract extends ethereum.SmartContract {
  static bind(address: Address): ExampleContract {
    return new ExampleContract("ExampleContract", address);
  }
}
