import React from 'react';

const NotificationSystem = ({ notifications, removeNotification }) => {
  return (
    <div className="notifications-container">
      {notifications.map(notification => (
        <div 
          key={notification.id} 
          className={`notification notification-${notification.type}`}
          onClick={() => removeNotification(notification.id)}
        >
          <div className="notification-content">
            <span className="notification-message">{notification.message}</span>
            <button className="notification-close">×</button>
          </div>
          <div className="notification-progress"></div>
        </div>
      ))}
      
      <style jsx>{`
        .notifications-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 400px;
        }

        .notification {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 15px;
          box-shadow: var(--shadow-lg);
          cursor: pointer;
          position: relative;
          overflow: hidden;
          animation: slideIn 0.3s ease-out;
        }

        .notification-success {
          border-left: 4px solid var(--success-color);
        }

        .notification-warning {
          border-left: 4px solid var(--warning-color);
        }

        .notification-error {
          border-left: 4px solid var(--danger-color);
        }

        .notification-info {
          border-left: 4px solid var(--info-color);
        }

        .notification-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .notification-message {
          color: var(--text-primary);
          font-size: var(--font-size-sm);
        }

        .notification-close {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .notification-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: var(--primary-color);
          animation: progress 5s linear;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes progress {
          from { width: 100%; }
          to { width: 0%; }
        }

        @media (max-width: 768px) {
          .notifications-container {
            right: 10px;
            left: 10px;
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
};

export default NotificationSystem;
