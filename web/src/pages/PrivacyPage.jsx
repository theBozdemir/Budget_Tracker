import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'

const CONTACT_EMAIL = 'tarikbozdemir2602@gmail.com'
const LAST_UPDATED = 'October 27, 2026'

export default function PrivacyPage() {
  const { user } = useAuth()

  return (
    <div className="legal-page">
      <Link to={user ? '/profile' : '/login'} className="back-link">
        ← {user ? 'Profile' : 'Sign in'}
      </Link>
      <h1>Privacy Policy</h1>
      <p className="muted small">Last updated: {LAST_UPDATED}</p>

      <p>
        Budget Tracker helps people track shared household expenses and income. This policy explains what information
        the app stores, who can see it, and how to delete it.
      </p>

      <h2>Information we store</h2>
      <ul>
        <li>
          <strong>Account:</strong> your name and email address, and a password that is handled by Firebase
          Authentication. We never see or store your password.
        </li>
        <li>
          <strong>Households:</strong> household names, currency, categories, members and pending invites (the invited
          email address and who sent the invite).
        </li>
        <li>
          <strong>Transactions:</strong> the amount, type, category, date, optional note, and the name of the person
          who added it.
        </li>
      </ul>
      <p>
        The app does not use advertising, does not track you across other apps or websites, and does not collect your
        location, contacts or device identifiers.
      </p>

      <h2>How we use it</h2>
      <p>
        Only to run the app: signing you in, showing your households and transactions, and sending invite and password
        reset emails. We do not sell or share your information with anyone for marketing.
      </p>

      <h2>Who can see it</h2>
      <p>
        Transactions, categories and members of a household are visible to everyone in that household. Households are
        private: people outside a household cannot see its data.
      </p>

      <h2>Where it is stored</h2>
      <p>
        Data is stored with Google Firebase (Firebase Authentication and Cloud Firestore) and is protected in transit
        with encryption. Google acts as our service provider; see the{' '}
        <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noreferrer">
          Firebase privacy information
        </a>
        .
      </p>

      <h2>Deleting your data</h2>
      <p>
        You can delete your account at any time in the app under <strong>Profile → Delete account</strong>. This
        deletes your login and profile, and any households where you are the only member along with their entries. You
        leave shared households; entries you added there remain visible to the other members because they are part of
        that household&apos;s shared budget. A household&apos;s creator can also delete the whole household and all of
        its entries from its settings.
      </p>

      <h2>Children</h2>
      <p>Budget Tracker is not directed at children under 13 and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we will update the date at the top of this page.</p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </div>
  )
}
