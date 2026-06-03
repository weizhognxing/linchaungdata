from app.routes.record_blueprint import records_bp

# Import route modules for side effects so they register handlers on records_bp.
from app.routes import records_lookup  # noqa: F401
from app.routes import records_labs  # noqa: F401
from app.routes import records_cases  # noqa: F401
from app.routes import records_care  # noqa: F401
