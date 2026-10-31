import styles from './LoginPage.module.css';

/** The stars behind the sign-in pages: stylesheet only, so nothing here is read out. */
export function LoginSky() {
  return (
    <div className={styles.sky} aria-hidden="true">
      <span className={`${styles.stars} ${styles.starsFar}`} />
      <span className={`${styles.stars} ${styles.starsMid}`} />
      <span className={`${styles.stars} ${styles.starsNear}`} />
    </div>
  );
}
