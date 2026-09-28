import { useEffect, useState } from 'react';

/** Square tiles made from the supplied logos by scripts/university-logos.py; the file name is the university slug. */
export const universityLogoUrl = (slug: string) => `/logos/universities/${slug}.webp`;

/** The university's logo, or its initials when there is no logo file (a university added later). */
export function UniversityLogo({ slug, initials, className }: { slug: string; initials: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [slug]);
  return <span className={`${className}${failed ? '' : ' has-logo'}`} aria-hidden="true">
    {failed ? initials : <img src={universityLogoUrl(slug)} alt="" width={96} height={96} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
  </span>;
}
