from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker

ENGINE = create_engine("sqlite:///data.db", echo=False, future=True)
SessionLocal = sessionmaker(bind=ENGINE, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

class Order(Base):
    __tablename__ = "orders"
    order_id   = Column(String, primary_key=True)
    provider   = Column(String, nullable=False)                # 'wata' | 'heleket'
    username   = Column(String, nullable=False)
    qty        = Column(Integer, nullable=False)
    amount     = Column(Integer, nullable=False)               # в минорных единицах (копейки/центы) ИЛИ строкой для Heleket
    currency   = Column(String, nullable=False)                # 'RUB'/'USD'/'USDT' и т.д.
    payment_url= Column(Text, nullable=True)
    external_id= Column(String, nullable=True)                 # id/uuid в платёжке
    status     = Column(String, nullable=False, default="created")  # created|pending|paid|failed|canceled
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    product = Column(String, nullable=False, default="stars")

def init_db():
    Base.metadata.create_all(ENGINE)

def get_session():
    return SessionLocal()
