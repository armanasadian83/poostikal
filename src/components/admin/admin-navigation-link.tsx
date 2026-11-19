'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import type {ComponentProps, MouseEvent} from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'target'> & {href:string};

/** Panel navigation always stays in this tab, including modifier and middle clicks. */
export function AdminNavigationLink({href,onClick,onAuxClick,...props}:Props){
  const router=useRouter();
  function navigate(event:MouseEvent<HTMLAnchorElement>){
    if(event.button!==0&&event.button!==1)return;
    // Run guards (such as unsaved settings) before navigating.
    onClick?.(event);
    if(event.defaultPrevented)return;
    event.preventDefault();
    router.push(href);
  }
  return <Link {...props} href={href} target="_self" onClick={navigate} onAuxClick={event=>{
    onAuxClick?.(event);
    if(!event.defaultPrevented&&event.button===1)navigate(event);
  }}/>;
}
