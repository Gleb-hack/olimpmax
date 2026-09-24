import { UserRound } from 'lucide-react';

export function ProfileAvatar({ image, large = false }: { image: string | null; large?: boolean }) {
  return <span className={`avatar ${large ? 'avatar--large' : ''}`}>{image ? <img src={image} alt="Фото профиля" /> : <UserRound size={large ? 38 : 27} strokeWidth={1.5} />}</span>;
}
