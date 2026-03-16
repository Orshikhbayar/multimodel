// NOTE: This file is duplicated at public/intro/script.js (which is the served copy).
// Keep both in sync or consolidate into one location.

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  });
});

// Header scroll effect
window.addEventListener("scroll", () => {
  const header = document.querySelector(".header");
  if (window.scrollY > 100) {
    header.style.background = "rgba(255, 255, 255, 0.98)";
    header.style.boxShadow = "0 2px 20px rgba(0, 0, 0, 0.1)";
  } else {
    header.style.background = "rgba(255, 255, 255, 0.95)";
    header.style.boxShadow = "none";
  }
});

// Intersection Observer for animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: "0px 0px -50px 0px",
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
    }
  });
}, observerOptions);

// Animate elements on scroll
document.addEventListener("DOMContentLoaded", () => {
  const animateElements = document.querySelectorAll(
    ".feature-card, .model-card, .testimonial-card, .use-case-card, .mode-card",
  );

  animateElements.forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(30px)";
    el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    observer.observe(el);
  });
});

// Chat interface animation
document.addEventListener("DOMContentLoaded", () => {
  const chatInterface = document.querySelector(".chat-interface");
  if (chatInterface) {
    setTimeout(() => {
      chatInterface.style.animation = "fadeInUp 1s ease forwards";
    }, 500);
  }
});

// Add CSS animation keyframes
const style = document.createElement("style");
style.textContent = `
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(30px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes pulse {
        0%, 100% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.05);
        }
    }
    
    .verification {
        animation: pulse 2s infinite;
    }
`;
document.head.appendChild(style);

// Mobile menu toggle (if needed)
const createMobileMenu = () => {
  const nav = document.querySelector(".nav");
  const navCenter = document.querySelector(".nav-center");

  if (window.innerWidth <= 768) {
    if (!document.querySelector(".mobile-menu-toggle")) {
      const toggleButton = document.createElement("button");
      toggleButton.className = "mobile-menu-toggle";
      toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
      toggleButton.style.cssText = `
                display: block;
                background: none;
                border: none;
                font-size: 1.5rem;
                color: #4b5563;
                cursor: pointer;
                padding: 0.5rem;
            `;

      nav.insertBefore(toggleButton, navCenter);

      toggleButton.addEventListener("click", () => {
        navCenter.style.display =
          navCenter.style.display === "none" ? "flex" : "none";
      });
    }
  }
};

// Handle responsive navigation
window.addEventListener("resize", createMobileMenu);
document.addEventListener("DOMContentLoaded", createMobileMenu);

// Button hover effects
document.querySelectorAll(".btn-primary, .btn-hero").forEach((button) => {
  button.addEventListener("mouseenter", function () {
    this.style.transform = "translateY(-2px)";
  });

  button.addEventListener("mouseleave", function () {
    this.style.transform = "translateY(0)";
  });
});

// Typing effect for hero title (optional enhancement)
const typeWriter = (element, text, speed = 100) => {
  let i = 0;
  element.innerHTML = "";

  const timer = setInterval(() => {
    if (i < text.length) {
      element.innerHTML += text.charAt(i);
      i++;
    } else {
      clearInterval(timer);
    }
  }, speed);
};

// Initialize typing effect on load
document.addEventListener("DOMContentLoaded", () => {
  const heroTitle = document.querySelector(".hero-title");
  if (heroTitle) {
    const originalText = heroTitle.textContent;
    setTimeout(() => {
      typeWriter(heroTitle, originalText, 80);
    }, 1000);
  }
});

// Form validation and interaction (for future contact forms)
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Performance optimization: Lazy load images
const lazyLoadImages = () => {
  const images = document.querySelectorAll("img[data-src]");
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove("lazy");
        imageObserver.unobserve(img);
      }
    });
  });

  images.forEach((img) => imageObserver.observe(img));
};

document.addEventListener("DOMContentLoaded", lazyLoadImages);
