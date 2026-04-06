import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addFavorite, listCatalogVehicles } from '../services/customerService'
import { toast } from '../hooks/useToast'
import { Link, useNavigate } from 'react-router-dom'
import { useCartStore } from '../stores/cartStore'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { CarCard } from '../components/shared/CarCard'
import {
  ArrowRight,
  CheckCircle2,
  Car,
  CalendarCheck,
  CarFront,
  ClipboardList,
  MonitorSmartphone,
  Shield,
  Sparkles,
  Truck,
  Wrench,
} from 'lucide-react'

const howItWorksIconProps = {
  size: 32,
  strokeWidth: 1.75,
  'aria-hidden': true as const,
}
import './HomePage.css'

export function HomePage() {
  const navigate = useNavigate()
  const setVehicle = useCartStore((s) => s.setVehicle)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalog', 'home', 20],
    queryFn: () => listCatalogVehicles({ pageSize: 20 }),
  })
  const vehicles = data?.items ?? []

  const categories = ['All', 'Sedan', 'SUV', 'Electric']
  
  const cars = useMemo(() => {
    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.name,
      make: vehicle.make,
      model: vehicle.model,
      type: vehicle.category === 'suv' ? 'SUV' : vehicle.category === 'ev' ? 'Electric' : vehicle.category === 'sedan' ? 'Sedan' : 'Other',
      price: Math.round(vehicle.pricePerDay * 6),
      seats: vehicle.seats,
      transmission: vehicle.transmission === 'manual' ? 'Manual' : 'Automatic',
      fuelType: vehicle.fuelType,
      image: vehicle.imageUrl,
      isElectric: vehicle.fuelType === 'electric',
    }))
  }, [vehicles])

  const filteredCars = useMemo(() => {
    if (selectedCategory === 'All') return cars
    return cars.filter(car => car.type === selectedCategory)
  }, [cars, selectedCategory])

  const advantages = [
    {
      title: 'Flexible Terms',
      description: 'You decide how long to drive your new car. Benefit from flexible subscription periods.',
      icon: <CalendarCheck size={18} />,
    },
    {
      title: 'Registration',
      description: 'We handle complete registration of your new car. Save time and effort.',
      icon: <ClipboardList size={18} />,
    },
    {
      title: 'Individual Mileage Selection',
      description: 'Choose the mileage package that fits your driving needs perfectly.',
      icon: <Car size={18} />,
    },
    {
      title: 'Taxes & Insurance',
      description: 'Vehicle tax and insurance protection are included in your subscription.',
      icon: <Shield size={18} />,
    },
    {
      title: 'Maintenance & Tire Service',
      description: 'We keep your car in top condition - inspections and tire changes included.',
      icon: <Wrench size={18} />,
    },
    {
      title: 'Home Delivery',
      description: 'We deliver your new car nationwide directly to your doorstep.',
      icon: <Truck size={18} />,
    },
  ]

  const howItWorks = [
    {
      step: '01',
      title: 'Choose your car',
      description: 'Browse our extensive fleet and select the perfect vehicle for your needs.',
      icon: <CarFront {...howItWorksIconProps} />,
    },
    {
      step: '02',
      title: 'Subscribe online',
      description: 'Complete your subscription in minutes with our simple online process.',
      icon: <MonitorSmartphone {...howItWorksIconProps} />,
    },
    {
      step: '03',
      title: 'Get delivered',
      description: 'Your car will be delivered to your doorstep within 3-5 business days.',
      icon: <Truck {...howItWorksIconProps} />,
    },
    {
      step: '04',
      title: 'Drive & enjoy',
      description: 'Enjoy your car with complete peace of mind. Insurance and maintenance included.',
      icon: <Sparkles {...howItWorksIconProps} />,
    },
  ]

  return (
    <div className="home-page">
      <Header />
      
      {/* Banner Section */}
      <section className="banner-section">
        <div className="banner-container">
          <div className="banner-content">
            <h1 className="banner-title">
              Your car subscription made <span className="highlight">simple.</span>
            </h1>
            <p className="banner-description">
              Drive the car you want without the hassle of buying. Subscribe to your dream car today.
            </p>
            
            <div className="banner-features">
              <div className="feature-row">
                <div className="feature-item">
                  <CheckCircle2 size={18} />
                  <span>No down payment</span>
                </div>
                <div className="feature-item">
                  <CheckCircle2 size={18} />
                  <span>All-inclusive pricing</span>
                </div>
              </div>
              <div className="feature-row">
                <div className="feature-item">
                  <CheckCircle2 size={18} />
                  <span>Flexible terms</span>
                </div>
                <div className="feature-item">
                  <CheckCircle2 size={18} />
                  <span>Free delivery</span>
                </div>
              </div>
            </div>

            <Link to="/browse" className="browse-button">
              Browse Cars
              <ArrowRight size={14} />
            </Link>

            <div className="banner-stats">
              <div className="stat-item">
                <div className="stat-number">10,000+</div>
                <div className="stat-label">Happy customers</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">500+</div>
                <div className="stat-label">Car models</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">98%</div>
                <div className="stat-label">Satisfaction rate</div>
              </div>
            </div>
          </div>
          
          <div className="banner-image">
            <div className="image-placeholder">Car Image</div>
            <div className="ready-badge">
              <div className="badge-icon"><Car size={18} /></div>
              <div>
                <div className="badge-title">Ready to drive</div>
                <div className="badge-subtitle">In 3-5 business days</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Choose Your Car Section */}
      <section className="choose-car-section">
        <div className="section-container">
          <div className="section-header">
            <h2 className="section-title">Choose your perfect car</h2>
            <p className="section-description">
              From compact city cars to luxury SUVs, find the perfect vehicle for your lifestyle.
            </p>
          </div>

          <div className="category-tabs">
            {categories.map((category) => (
              <button
                key={category}
                className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="cars-grid">
            {isLoading ? (
              <div className="loading-state">Loading vehicles…</div>
            ) : isError ? (
              <div className="error-state">Failed to load vehicles</div>
            ) : (
              filteredCars.map((car) => (
                <CarCard
                  key={car.id}
                  {...car}
                  onConfigure={() => {
                    setVehicle({
                      id: car.id,
                      name: car.name,
                      make: car.make,
                      fuelType: car.fuelType,
                      transmission: car.transmission,
                      seats: car.seats,
                      image: car.image,
                      pricePerDay: Math.round(car.price / 6),
                    })
                    navigate('/cart')
                  }}
                  onFavorite={() => {
                    addFavorite(car.id)
                      .then(() => toast.success('Saved to favorites'))
                      .catch(() => toast.error('Failed to save favorite'))
                  }}
                />
              ))
            )}
          </div>
          <div className="view-all-cars">
            <Link to="/browse" className="view-all-button">
              View All Cars
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section">
        <div className="section-container">
          <h2 className="section-title">How it works</h2>
          <p className="section-description">
            Getting your dream car has never been easier. Follow these simple steps.
          </p>
          
          <div className="how-it-works-grid">
            {howItWorks.map((item) => (
              <div key={item.step} className="how-it-works-card">
                <div className="step-number">{item.step}</div>
                <div className="step-icon">{item.icon}</div>
                <h3 className="step-title">{item.title}</h3>
                <p className="step-description">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Marketing Container */}
      <section className="marketing-section">
        <div className="section-container">
          <div className="marketing-content">
            <div className="marketing-text">
              <h3 className="marketing-title">Everything included, nothing to worry about</h3>
              <div className="marketing-features">
                <div className="marketing-feature">
                <Shield size={18} />
                  <div>
                    <h4>Comprehensive Insurance</h4>
                    <p>Full coverage including liability, collision, and comprehensive protection.</p>
                  </div>
                </div>
                <div className="marketing-feature">
                <Wrench size={18} />
                  <div>
                    <h4>Maintenance & Repairs</h4>
                    <p>Regular maintenance, tire changes, and unexpected repairs are all covered.</p>
                  </div>
                </div>
                <div className="marketing-feature">
                <Truck size={18} />
                  <div>
                    <h4>24/7 Roadside Assistance</h4>
                    <p>Round-the-clock support wherever you are, whenever you need it.</p>
                  </div>
                </div>
                <div className="marketing-feature">
                <CalendarCheck size={18} />
                  <div>
                    <h4>Flexible Terms</h4>
                    <p>Monthly subscriptions with the freedom to change or cancel anytime.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="marketing-image">
              <div className="image-placeholder">Marketing Image</div>
            </div>
          </div>
        </div>
      </section>

      {/* Advantages Section */}
      <section className="advantages-section">
        <div className="section-container">
          <h2 className="section-title">All advantages of Carflow at a glance</h2>
          <div className="advantages-grid">
            {advantages.map((advantage, index) => (
              <div key={index} className="advantage-card">
                <div className="advantage-icon">{advantage.icon}</div>
                <h3 className="advantage-title">{advantage.title}</h3>
                <p className="advantage-description">{advantage.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stay Updated Section */}
      <section className="get-offers-section">
        <div className="section-container">
          <div className="offers-content">
            <div className="offers-text">
              <h3 className="offers-title">Stay updated — follow us on social media</h3>
              <p className="offers-description">
                Follow Carflow on social media to get the latest offers, news, and updates.
              </p>
              <Link to="/faqs" className="more-info">More Information</Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

