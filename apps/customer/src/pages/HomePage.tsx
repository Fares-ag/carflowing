import { computeRentalTotal, vehicleCategoryLabel } from '@carflow/shared'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CircleCheck,
  CreditCard,
  Home,
  KeyRound,
  Search,
  Settings2,
  Shield,
  Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CarCard } from '../components/shared/CarCard'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../hooks/useToast'
import { addFavorite, listCatalogVehicles } from '../services/customerService'
import './HomePage.css'

const CATEGORIES = ['All', 'Sedan', 'SUV', 'Electric'] as const

const ADVANTAGES = [
  {
    title: 'Flexible Terms',
    description: 'You decide how long to drive your new car. Benefit from our short and flexible terms.',
    icon: CalendarDays,
  },
  {
    title: 'Registration',
    description:
      "The vehicle is fully registered and good to go. All that's left is for you to get behind the wheel.",
    icon: KeyRound,
  },
  {
    title: 'Insurance',
    description:
      'All vehicles in our fleet are fully insured prior to handover, ensuring a safe and worry-free driving experience.',
    icon: Settings2,
  },
  {
    title: 'Roadside Assistance',
    description: 'Your journey is supported by comprehensive roadside assistance, available around the clock.',
    icon: Shield,
  },
  {
    title: 'Maintenance & Repair',
    description:
      'We cover all maintenance and repairs, keeping your vehicle in top condition throughout your subscription.',
    icon: Wrench,
  },
  {
    title: 'Delivery & Return',
    description: 'We offer seamless vehicle delivery and return directly to your desired location.',
    icon: Home,
  },
]

const INCLUDED_FEATURES = [
  {
    title: 'Comprehensive Insurance',
    description: 'Full coverage including liability, collision, and comprehensive insurance.',
  },
  {
    title: 'Maintenance & Repairs',
    description: 'Regular maintenance, tire changes, and unexpected repairs covered.',
  },
  {
    title: '24/7 Roadside Assistance',
    description: "Round-the-clock support wherever you are, whenever you need it.",
  },
  {
    title: 'Flexible Terms',
    description: 'Monthly subscriptions with the freedom to change or cancel anytime.',
  },
]

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Choose your car',
    description:
      'Browse our fleet and pick the car that fits. Filter by brand, type, or budget.',
    icon: Search,
  },
  {
    step: '02',
    title: 'Request online',
    description:
      'Set duration and start date on the car page, then send one request. No cart or checkout maze.',
    icon: CreditCard,
  },
  {
    step: '03',
    title: 'Get approved',
    description:
      'Track status in My booking. When the dealer approves, pick up and pay at the shop — or pay online if you prefer.',
    icon: CarFront,
  },
  {
    step: '04',
    title: 'Drive & enjoy',
    description:
      'Enjoy your rental with clear dates, dealer contact, and support when you need it.',
    icon: CircleCheck,
  },
]

export function HomePage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORIES)[number]>('All')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalog', 'home', 12],
    queryFn: () => listCatalogVehicles({ pageSize: 12 }),
  })

  const cars = useMemo(() => {
    return (data?.items ?? []).map((vehicle, index) => ({
      id: vehicle.id,
      name: vehicle.name,
      type: vehicleCategoryLabel(vehicle.category),
      price: Math.round(computeRentalTotal(vehicle.pricePerDay, 1)),
      pricePeriod: 'month' as const,
      seats: vehicle.seats,
      transmission: vehicle.transmission === 'manual' ? 'Manual' : 'Automatic',
      fuelType: vehicle.fuelType,
      image: vehicle.imageUrl,
      isElectric: vehicle.fuelType === 'electric',
      isPopular: index < 3,
    }))
  }, [data])

  const filteredCars = useMemo(() => {
    if (selectedCategory === 'All') return cars.slice(0, 6)
    if (selectedCategory === 'Electric') {
      return cars.filter((car) => car.isElectric).slice(0, 6)
    }
    return cars.filter((car) => car.type === selectedCategory).slice(0, 6)
  }, [cars, selectedCategory])

  const handleFavorite = (vehicleId: string) => {
    if (!session) {
      navigate(`/login?redirect=${encodeURIComponent('/')}`)
      return
    }
    addFavorite(vehicleId)
      .then(() => toast.success('Saved to your account.'))
      .catch(() => toast.error('Failed to save car.'))
  }

  // Live catalogue size — the only headline number we can actually stand behind.
  const availableCars = data?.total ?? 0

  return (
    <div className="home-page">
      <Header />

      <section className="banner-section" aria-label="Hero">
        <div className="banner-container">
          <div className="banner-content">
            <h1 className="banner-title">
              Your Car Subscription Made <span className="highlight">simple.</span>
            </h1>
            <p className="banner-description">
              Drive the car you want without the hassle of buying. All-inclusive car subscriptions with
              insurance, maintenance, and roadside assistance included.
            </p>

            <div className="banner-features">
              <div className="feature-row">
                <div className="feature-item">
                  <CheckCircle2 size={18} aria-hidden />
                  <span>No down payment</span>
                </div>
                <div className="feature-item">
                  <CheckCircle2 size={18} aria-hidden />
                  <span>All-inclusive pricing</span>
                </div>
              </div>
              <div className="feature-row">
                <div className="feature-item">
                  <CheckCircle2 size={18} aria-hidden />
                  <span>Flexible terms</span>
                </div>
                <div className="feature-item">
                  <CheckCircle2 size={18} aria-hidden />
                  <span>Free delivery</span>
                </div>
              </div>
            </div>

            <Link to="/browse" className="browse-button">
              Browse Cars
              <ArrowRight size={16} />
            </Link>

            {/* Only counts we can prove. The previous "1000+ happy customers /
                500+ car models / 98% satisfaction" figures were invented. */}
            {availableCars > 0 && (
              <div className="banner-stats">
                <div className="stat-item">
                  <div className="stat-number">{availableCars}</div>
                  <div className="stat-label">
                    {availableCars === 1 ? 'Car available now' : 'Cars available now'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="banner-image">
            <img
              src="/hero-img.png?v=3"
              alt="Customer with their Carflow vehicle"
              className="banner-image__photo"
            />
            <div className="ready-badge">
              <div className="badge-icon" aria-hidden>
                <CheckCircle2 size={22} />
              </div>
              <div>
                <div className="badge-title">Ready to drive</div>
                <div className="badge-subtitle">In 3-5 business days</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="choose-car-section" aria-labelledby="choose-car-heading">
        <div className="choose-car-inner">
          <div className="choose-car-header">
            <h2 id="choose-car-heading" className="choose-car-title">
              Choose your perfect car
            </h2>
            <p className="choose-car-description">
              From compact city cars to luxury SUVs, find the perfect vehicle for your lifestyle. All
              cars come with clear monthly pricing — request in one step.
            </p>
          </div>

          <div className="category-tabs" role="tablist" aria-label="Car categories">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {isLoading ? (
            <p className="choose-car-state">Loading vehicles…</p>
          ) : isError ? (
            <p className="choose-car-state">Could not load vehicles. Try Browse instead.</p>
          ) : filteredCars.length === 0 ? (
            <p className="choose-car-state">No cars in this category yet.</p>
          ) : (
            <div className="cars-grid">
              {filteredCars.map((car) => (
                <CarCard
                  key={car.id}
                  {...car}
                  onConfigure={() => navigate(`/car/${car.id}`)}
                  onFavorite={session ? () => handleFavorite(car.id) : undefined}
                />
              ))}
            </div>
          )}

          <div className="view-all-cars">
            <Link to="/browse" className="view-all-button">
              View all cars
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <section className="how-it-works-section" id="how-it-works" aria-labelledby="how-it-works-heading">
        <div className="how-it-works-inner">
          <h2 id="how-it-works-heading" className="how-it-works-title">
            How it works
          </h2>
          <p className="how-it-works-intro">
            Getting your dream car has never been easier. Follow these simple steps and you&apos;ll be
            driving in no time.
          </p>

          <div className="how-it-works-grid">
            {HOW_IT_WORKS.map((item) => {
              const Icon = item.icon
              return (
                <article key={item.step} className="how-it-works-card">
                  <span className="how-it-works-step">{item.step}</span>
                  <div className="how-it-works-icon" aria-hidden="true">
                    <Icon size={28} strokeWidth={1.75} />
                  </div>
                  <h3 className="how-it-works-card-title">{item.title}</h3>
                  <p className="how-it-works-card-desc">{item.description}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="included-section" aria-labelledby="included-heading">
        <div className="included-inner">
          <div className="included-content">
            <h2 id="included-heading" className="included-title">
              Everything included, nothing to worry about
            </h2>
            <ul className="included-list">
              {INCLUDED_FEATURES.map((feature) => (
                <li key={feature.title} className="included-item">
                  <span className="included-icon" aria-hidden="true">
                    <CheckCircle2 size={22} strokeWidth={2.25} />
                  </span>
                  <div>
                    <h3 className="included-item-title">{feature.title}</h3>
                    <p className="included-item-desc">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="included-media">
            <img
              src="/included-img.png?v=1"
              alt="Browse and book cars on your phone with Carflow"
              className="included-media__photo"
            />
          </div>
        </div>
      </section>

      <section className="advantages-section" aria-labelledby="advantages-heading">
        <div className="advantages-inner">
          <h2 id="advantages-heading" className="advantages-title">
            All advantages of Carflow at a glance
          </h2>
          <div className="advantages-grid">
            {ADVANTAGES.map((item) => {
              const Icon = item.icon
              return (
                <article key={item.title} className="advantage-card">
                  <div className="advantage-icon" aria-hidden="true">
                    <Icon size={22} strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="advantage-title">{item.title}</h3>
                    <p className="advantage-description">{item.description}</p>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="get-offers-section" aria-labelledby="offers-heading">
        <div className="offers-inner">
          <div className="offers-text">
            <h2 id="offers-heading" className="offers-title">
              Don&apos;t miss any car subscription offers anymore!
            </h2>
            <p className="offers-description">
              Marketing emails are opt-in and managed from your account, so you always control what
              we send and can turn it off in one click.
            </p>
          </div>

          {/* The old sign-up form was a setTimeout stub: it discarded the email
              and the marketing consent while telling the customer they were
              subscribed. Until a real subscribe endpoint exists, point at the
              opt-in that genuinely works (user_preferences.marketingEmails). */}
          <div className="offers-actions">
            {session ? (
              <Link to="/settings?section=notifications" className="submit-button">
                Manage email preferences
              </Link>
            ) : (
              <Link to="/signup" className="submit-button">
                Create an account
              </Link>
            )}
            <Link to="/browse" className="offers-secondary">
              Browse cars instead
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
