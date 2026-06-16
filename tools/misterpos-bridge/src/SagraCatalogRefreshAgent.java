import java.lang.instrument.Instrumentation;
import misterpos.dao.AreaFactory;
import misterpos.dao.ArticleFactory;

public final class SagraCatalogRefreshAgent {
  private SagraCatalogRefreshAgent() {}

  public static void agentmain(String args, Instrumentation instrumentation) throws Exception {
    new AreaFactory().fireListeners();
    ArticleFactory.fireListeners();
    System.out.println("[sagra-catalog-refresh] refreshed area and article listeners");
  }
}
