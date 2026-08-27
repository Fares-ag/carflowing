import type { DealerReview } from '@carflow/shared'
import { formatDate } from '@carflow/shared'
import { MessageSquare, Star } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import { listDealerReviews, respondToDealerReview } from '../services/dealerService'
import './ReviewsPage.css'

const PAGE_SIZE = 10

export function ReviewsPage() {
  const [reviews, setReviews] = useState<DealerReview[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [responseDraft, setResponseDraft] = useState('')
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    listDealerReviews({ page, pageSize: PAGE_SIZE })
      .then((result) => {
        setReviews(result.items)
        setTotal(result.total)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load reviews'))
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleRespond = async (reviewId: string) => {
    const text = responseDraft.trim()
    if (!text) {
      toast.error('Write a response first')
      return
    }
    setSubmittingId(reviewId)
    try {
      await respondToDealerReview(reviewId, text)
      toast.success('Response published')
      setRespondingId(null)
      setResponseDraft('')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to post response')
    } finally {
      setSubmittingId(null)
    }
  }

  return (
    <div className="dealer-layout">
      <Sidebar />
      <div className="dealer-main">
        <Header title="Customer reviews" />
        <main className="reviews-page">
          <p className="reviews-page__intro">
            Reviews from customers who completed a subscription on your cars. You can post one public
            response per review.
          </p>

          {loading ? (
            <p className="reviews-page__empty">Loading reviews…</p>
          ) : reviews.length === 0 ? (
            <p className="reviews-page__empty">No customer reviews yet.</p>
          ) : (
            <ul className="reviews-list">
              {reviews.map((review) => (
                <li key={review.id} className="reviews-card">
                  <div className="reviews-card__head">
                    <div>
                      <strong>{review.customerName ?? 'Customer'}</strong>
                      <span className="reviews-card__vehicle">{review.vehicleName ?? 'Vehicle'}</span>
                    </div>
                    <div className="reviews-card__rating" aria-label={`${review.rating} out of 5`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          size={14}
                          fill={i < review.rating ? '#f59e0b' : 'none'}
                          color={i < review.rating ? '#f59e0b' : '#d1d5db'}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="reviews-card__date">{formatDate(review.createdAt)}</p>
                  {review.comment && <p className="reviews-card__comment">{review.comment}</p>}

                  {review.dealerResponse ? (
                    <blockquote className="reviews-card__response">
                      <strong>Your response</strong>
                      <p>{review.dealerResponse}</p>
                      {review.dealerRespondedAt && (
                        <span className="reviews-card__response-date">
                          {formatDate(review.dealerRespondedAt)}
                        </span>
                      )}
                    </blockquote>
                  ) : respondingId === review.id ? (
                    <div className="reviews-card__form">
                      <textarea
                        rows={3}
                        value={responseDraft}
                        placeholder="Thank the customer and address their feedback…"
                        onChange={(e) => setResponseDraft(e.target.value)}
                      />
                      <div className="reviews-card__form-actions">
                        <button
                          type="button"
                          className="reviews-btn"
                          disabled={submittingId === review.id}
                          onClick={() => {
                            setRespondingId(null)
                            setResponseDraft('')
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="reviews-btn reviews-btn--primary"
                          disabled={submittingId === review.id}
                          onClick={() => void handleRespond(review.id)}
                        >
                          {submittingId === review.id ? 'Publishing…' : 'Publish response'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="reviews-btn reviews-btn--primary"
                      onClick={() => {
                        setRespondingId(review.id)
                        setResponseDraft('')
                      }}
                    >
                      <MessageSquare size={14} />
                      Respond
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <nav className="reviews-pagination" aria-label="Review pages">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </main>
      </div>
    </div>
  )
}
