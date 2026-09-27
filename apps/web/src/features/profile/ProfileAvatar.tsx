import { Icon } from '@olimp/ui';

export function ProfileAvatar({ image, large = false }: { image: string | null; large?: boolean }) {
  return <span className={`avatar ${large ? 'avatar--large' : ''}`}>{image ? <img src={image} alt="Фото профиля" /> : <Icon name="user" size={large ? 34 : 26} />}</span>;
}
