import Image from 'next/image';
import stickers from '../../../backend/src/support-stickers.json';
import { Icon } from '../icons';
import styles from './support.module.css';

export type Sender = 'staff' | 'customer';
export type Quote = {id: string; sender: Sender; body: string; stickerId: string | null};
export type Likes = {id: string; likeCount: number; liked: boolean; version: string};
export type Message = Quote & Likes & {createdAt: string; replyTo: Quote | null};

export function QuotePreview({message}: {message: Quote}) {
  return <blockquote className={styles.quote}>
    <strong>{message.sender==='staff' ? 'پشتیبانی' : 'مشتری'}</strong><span dir="auto">{message.body}</span>
  </blockquote>;
}

function Sticker({sticker, compact=false}: {sticker: typeof stickers[number]; compact?: boolean}) {
  return <span className={styles.sticker} data-compact={compact}>
    <Image src={sticker.image} alt="" width={100} height={88} sizes={compact?'62px':'100px'}/>
    <span>{sticker.label}</span>
  </span>;
}

const emojiGroups = [
  { label: 'حال و احوال', items: '😊 😍 🥰 😘 😄 😂 😉 🤔 😌 😔 😮 🥹 🙂 😎 🤩 🥳 😁 🤗 😅 🤭 😇 🥺 😢 🧐 😴 😋'.split(' ') },
  { label: 'دست‌ها و دل‌ها', items: '🙏 👍 👋 👏 👌 🙌 🤝 👊 ✌️ 🤞 💪 🫶 🫰 🤲 👇 ☝️ ❤️ 💜 🩷 🤍 🧡 💛 💚 🩵 💙 💖 💕 💗 💝 💌'.split(' ') },
  { label: 'پوست و مو', items: '🧴 🫧 🧼 🧽 🛁 🚿 💧 🪞 🪮 💆‍♀️ 💆‍♂️ 💇‍♀️ 💅 💄 👄 💋 🧖‍♀️ 🧖‍♂️ 🧺 🍃 🌿 🌱 🪴 🥒 🥥 🥑'.split(' ') },
  { label: 'گل و انرژی خوب', items: '✨ 🌟 ⭐ 💫 🌸 🌷 🌹 🌺 🌻 🌼 🪻 💐 🦋 ☀️ 🌙 🌈 🕊️ 🎉 🎊 🎈 🎁 🥂 🧁 🍰 ☕ 🍵'.split(' ') },
  { label: 'سفارش و پشتیبانی', items: '✅ ✔️ 🆗 💬 📩 ✉️ 📞 🎧 📸 🔎 📋 📝 📌 💡 ⏳ ⏰ 🗓️ 🛍️ 🛒 🏷️ 📦 🎀 🚚 🛵 📍 🏠 🔔'.split(' ') },
];
export type Picker = 'emoji' | 'sticker';

export function ExpressionPicker({tab, onTab, onEmoji, onSticker, disabled}: {
  tab: Picker; onTab:(tab:Picker)=>void; onEmoji:(emoji:string, focusComposer:boolean)=>void; onSticker:(id:string)=>void; disabled:boolean;
}) {
  return <div className={styles.picker} role="group" aria-label="ایموجی و استیکر">
    <div className={styles.pickerTabs}>
      <button type="button" aria-pressed={tab==='emoji'} onClick={()=>onTab('emoji')}>ایموجی</button>
      <button type="button" aria-pressed={tab==='sticker'} onClick={()=>onTab('sticker')}>استیکر</button>
    </div>
    <div key={tab} className={styles.pickerChoices}>
      {tab==='emoji' ? emojiGroups.map(group=>
        <section key={group.label} aria-label={group.label}>
          <h3 className={styles.emojiHeading}>{group.label}</h3>
          <div className={styles.emojiGrid}>{group.items.map(emoji=>
            <button type="button" key={emoji} disabled={disabled} onClick={event=>
              onEmoji(emoji, event.detail > 0 && window.matchMedia('(hover: hover) and (pointer: fine)').matches)
            }>{emoji}</button>
          )}</div>
        </section>
      ) : <div className={styles.stickerGrid}>{stickers.map(item=>
        <button type="button" disabled={disabled} key={item.id} aria-label={'ارسال استیکر '+item.label} onClick={()=>onSticker(item.id)}>
          <Sticker compact sticker={item}/>
        </button>
      )}</div>}
    </div>
  </div>;
}

export function MessageBubble({message, viewer, busy, onReply, onLike, clock}: {
  message: Message; viewer: Sender; busy:boolean; onReply:()=>void; onLike:()=>void; clock:string;
}) {
  const sticker=stickers.find(item=>item.id===message.stickerId);
  return <div className={styles.bubble} data-own={message.sender===viewer} data-message={message.id} data-sticker={Boolean(sticker)}>
    {message.replyTo && <QuotePreview message={message.replyTo}/>}
    {sticker ? <Sticker sticker={sticker}/> : <p dir="auto">{message.body}</p>}
    <div className={styles.bubbleFoot}>
      <button type="button" title="پاسخ به پیام" aria-label="پاسخ به پیام" onClick={onReply}><Icon name="reply" size={15}/></button>
      <button type="button" title={message.liked?'برداشتن پسند':'پسندیدن پیام'} aria-label="پسندیدن پیام" aria-pressed={message.liked} disabled={busy} onClick={onLike}>
        <Icon name="heart" size={15}/>{message.likeCount>0 && <span>{message.likeCount.toLocaleString('fa-IR')}</span>}
      </button>
      <time dateTime={message.createdAt}>{clock}</time>
    </div>
  </div>;
}
