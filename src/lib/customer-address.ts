import type {OrderRecipient} from './orders';
export type SavedAddress=Omit<OrderRecipient,'note'>&{id:string;label:string};
