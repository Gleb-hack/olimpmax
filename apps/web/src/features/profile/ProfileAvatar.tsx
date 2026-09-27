import { useState } from 'react';
import { Icon } from '@olimp/ui';
import { max } from '../../lib/max';

export function ProfileAvatar({ image, large = false }: { image: string | null; large?: boolean }) {
  const source = image ?? max.photoUrl;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <span className={`avatar ${large ? 'avatar--large' : ''}`}>{source && source !== failedSource ? <img src={source} alt="Фото профиля" referrerPolicy="no-referrer" onError={() => setFailedSource(source)} /> : <Icon name="user" size={large ? 34 : 26} />}</span>;
}
