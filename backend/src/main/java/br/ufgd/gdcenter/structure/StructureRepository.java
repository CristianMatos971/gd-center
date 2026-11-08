package br.ufgd.gdcenter.structure;

import java.util.List;

public interface StructureRepository {
    List<Structure> loadAll();
    void saveAll(List<Structure> structures);
}
